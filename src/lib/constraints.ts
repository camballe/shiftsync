import { db } from '@/db';
import {
  shifts,
  shiftAssignments,
  staffSkills,
  staffLocationCerts,
  availabilityRules,
  availabilityExceptions,
  users,
} from '@/db/schema';
import { eq, and, or, ne, gte, lte } from 'drizzle-orm';
import { formatDateLocal } from '@/lib/date-utils';

export interface ConstraintViolation {
  type: 'error' | 'warning';
  code: string;
  message: string;
}

export interface AssignmentValidationResult {
  valid: boolean;
  violations: ConstraintViolation[];
  suggestions?: string[];
}

interface ShiftData {
  id: string;
  locationId: string;
  date: string;
  startTime: string;
  endTime: string;
  skillId: string;
}

// ── Helpers for overnight shift math ─────────────────────────────

/** Convert HH:MM to minutes since midnight */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** True when endTime represents the next calendar day (e.g. 23:00→03:00) */
function isOvernightShift(startTime: string, endTime: string): boolean {
  return endTime <= startTime;
}

/** Shift duration in hours, handling overnight correctly */
function shiftDurationHours(startTime: string, endTime: string): number {
  let mins = toMinutes(endTime) - toMinutes(startTime);
  if (mins <= 0) mins += 24 * 60; // overnight
  return mins / 60;
}

/**
 * Convert a shift's start/end into absolute minute offsets from midnight
 * of the shift's start date so overlap comparisons always work.
 *   Normal 09:00-17:00  →  [540, 1020]
 *   Overnight 23:00-03:00 → [1380, 1620]
 */
function absoluteRange(startTime: string, endTime: string): [number, number] {
  const s = toMinutes(startTime);
  let e = toMinutes(endTime);
  if (e <= s) e += 24 * 60;
  return [s, e];
}

// ── Day-of-week helpers ──────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ENUMS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

function getDayInfo(date: string) {
  const d = new Date(date + 'T00:00:00');
  const idx = d.getDay();
  return { dayName: DAY_NAMES[idx], dayEnum: DAY_ENUMS[idx] as typeof DAY_ENUMS[number] };
}

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return formatDateLocal(d);
}

// ── Central constraint engine ────────────────────────────────────

/**
 * Validates all business rules before allowing an assignment.
 */
export async function validateAssignment(
  staffId: string,
  shift: ShiftData
): Promise<AssignmentValidationResult> {
  const violations: ConstraintViolation[] = [];
  const suggestions: string[] = [];

  // 1. Check if staff has required skill
  const staffHasSkill = await checkSkillMatch(staffId, shift.skillId);
  if (!staffHasSkill) {
    violations.push({
      type: 'error',
      code: 'SKILL_MISMATCH',
      message: 'Staff member does not have the required skill for this shift',
    });
  }

  // 2. Check if staff is certified for this location
  const isLocationCertified = await checkLocationCertification(staffId, shift.locationId);
  if (!isLocationCertified) {
    violations.push({
      type: 'error',
      code: 'LOCATION_NOT_CERTIFIED',
      message: 'Staff member is not certified to work at this location',
    });
  }

  // 3. Check availability rules and exceptions
  const availabilityCheck = await checkAvailability(staffId, shift.date, shift.startTime, shift.endTime);
  if (!availabilityCheck.available) {
    violations.push({
      type: 'error',
      code: 'NOT_AVAILABLE',
      message: availabilityCheck.reason || 'Staff member is not available at this time',
    });
  }

  // 4. Check for overlapping shifts
  const hasOverlap = await checkShiftOverlap(staffId, shift);
  if (hasOverlap) {
    violations.push({
      type: 'error',
      code: 'SHIFT_OVERLAP',
      message: 'Staff member has an overlapping shift at this time',
    });
  }

  // 5. Check 10-hour rest period
  const restPeriodViolation = await check10HourRest(staffId, shift);
  if (restPeriodViolation) {
    violations.push({
      type: 'error',
      code: 'REST_PERIOD_VIOLATION',
      message: restPeriodViolation,
    });
  }

  // 6. Check labor law limits (warnings, not hard errors)
  const laborWarnings = await checkLaborLimits(staffId, shift);
  violations.push(...laborWarnings);

  // Generate suggestions if there are error-level violations
  if (violations.some((v) => v.type === 'error')) {
    const qualifiedStaff = await findStaffWithSkill(shift.skillId, shift.locationId);
    const others = qualifiedStaff.filter((s) => s.id !== staffId);
    if (others.length > 0) {
      suggestions.push(
        `Available alternatives: ${others.slice(0, 3).map((s) => s.name).join(', ')}`
      );
    }
  }

  return {
    valid: violations.filter((v) => v.type === 'error').length === 0,
    violations,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

// ── Individual constraint checks ─────────────────────────────────

async function checkSkillMatch(staffId: string, skillId: string): Promise<boolean> {
  const result = await db
    .select()
    .from(staffSkills)
    .where(and(eq(staffSkills.staffId, staffId), eq(staffSkills.skillId, skillId)))
    .limit(1);

  return result.length > 0;
}

async function checkLocationCertification(staffId: string, locationId: string): Promise<boolean> {
  const result = await db
    .select()
    .from(staffLocationCerts)
    .where(
      and(
        eq(staffLocationCerts.staffId, staffId),
        eq(staffLocationCerts.locationId, locationId)
      )
    )
    .limit(1);

  return result.length > 0;
}

/**
 * Check staff availability based on rules and exceptions.
 * For overnight shifts (endTime <= startTime) we verify that
 * the start-date covers startTime→midnight AND the next date
 * covers midnight→endTime.
 */
async function checkAvailability(
  staffId: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<{ available: boolean; reason?: string }> {
  // Check for availability exceptions first (higher priority)
  const exceptions = await db
    .select()
    .from(availabilityExceptions)
    .where(
      and(
        eq(availabilityExceptions.staffId, staffId),
        eq(availabilityExceptions.date, date)
      )
    );

  for (const exception of exceptions) {
    if (!exception.isAvailable) {
      return {
        available: false,
        reason: exception.reason || 'Staff marked as unavailable on this date',
      };
    }
  }

  const overnight = isOvernightShift(startTime, endTime);

  if (!overnight) {
    // ── Normal shift: single-day availability check ──
    return checkSingleDayAvailability(staffId, date, startTime, endTime);
  }

  // ── Overnight shift: check two days ──
  // Day 1: availability must cover startTime through end-of-day
  const day1 = await checkSingleDayAvailability(staffId, date, startTime, '23:59');
  if (!day1.available) {
    const { dayName } = getDayInfo(date);
    return {
      available: false,
      reason: `Overnight shift starts at ${startTime} but staff availability on ${dayName} does not cover that time`,
    };
  }

  // Day 2: availability must cover start-of-day through endTime
  const nextDate = addDays(date, 1);

  // Also check exceptions on day 2
  const day2Exceptions = await db
    .select()
    .from(availabilityExceptions)
    .where(
      and(
        eq(availabilityExceptions.staffId, staffId),
        eq(availabilityExceptions.date, nextDate)
      )
    );

  for (const exception of day2Exceptions) {
    if (!exception.isAvailable) {
      return {
        available: false,
        reason: exception.reason || 'Staff marked as unavailable on the next date (overnight shift spans two days)',
      };
    }
  }

  const day2 = await checkSingleDayAvailability(staffId, nextDate, '00:00', endTime);
  if (!day2.available) {
    const { dayName } = getDayInfo(nextDate);
    return {
      available: false,
      reason: `Overnight shift ends at ${endTime} but staff availability on ${dayName} does not cover that time`,
    };
  }

  return { available: true };
}

/** Check that a single day's availability rules cover the given time range. */
async function checkSingleDayAvailability(
  staffId: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<{ available: boolean; reason?: string }> {
  const { dayName, dayEnum } = getDayInfo(date);

  const rules = await db
    .select()
    .from(availabilityRules)
    .where(
      and(
        eq(availabilityRules.staffId, staffId),
        eq(availabilityRules.dayOfWeek, dayEnum)
      )
    );

  if (rules.length === 0) {
    return {
      available: false,
      reason: `Staff has no availability set for ${dayName}`,
    };
  }

  const needStart = toMinutes(startTime);
  const needEnd = toMinutes(endTime);

  for (const rule of rules) {
    const ruleStart = toMinutes(rule.startTime);
    const ruleEnd = toMinutes(rule.endTime);
    if (needStart >= ruleStart && needEnd <= ruleEnd) {
      return { available: true };
    }
  }

  return {
    available: false,
    reason: `Shift time (${startTime}-${endTime}) falls outside staff availability on ${dayName}`,
  };
}

/**
 * Check for overlapping shifts.
 * Handles overnight shifts by normalising both ranges to absolute
 * minute offsets from midnight of the start date.
 */
async function checkShiftOverlap(staffId: string, newShift: ShiftData): Promise<boolean> {
  const overnight = isOvernightShift(newShift.startTime, newShift.endTime);

  // For overnight shifts we must also check the next date for existing assignments
  const datesToCheck = [newShift.date];
  if (overnight) {
    datesToCheck.push(addDays(newShift.date, 1));
  }
  // Also check the day before in case an existing overnight shift spills into this date
  datesToCheck.push(addDays(newShift.date, -1));

  const assignments = await db
    .select({
      shift: {
        id: shifts.id,
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
      },
    })
    .from(shiftAssignments)
    .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
    .where(
      and(
        eq(shiftAssignments.staffId, staffId),
        or(...datesToCheck.map((d) => eq(shifts.date, d))),
        ne(shifts.id, newShift.id)
      )
    );

  // Convert the new shift to an absolute minute range relative to its start date
  const newRange = absoluteRange(newShift.startTime, newShift.endTime);
  // Convert to minutes-from-epoch-of-shift-date for cross-day comparison
  const newDateBase = new Date(newShift.date + 'T00:00:00').getTime();
  const newAbsStart = newDateBase + newRange[0] * 60000;
  const newAbsEnd = newDateBase + newRange[1] * 60000;

  for (const assignment of assignments) {
    const existingRange = absoluteRange(assignment.shift.startTime, assignment.shift.endTime);
    const existingDateBase = new Date(assignment.shift.date + 'T00:00:00').getTime();
    const existingAbsStart = existingDateBase + existingRange[0] * 60000;
    const existingAbsEnd = existingDateBase + existingRange[1] * 60000;

    // Two ranges overlap iff start1 < end2 && start2 < end1
    if (newAbsStart < existingAbsEnd && existingAbsStart < newAbsEnd) {
      return true;
    }
  }

  return false;
}

/**
 * Check 10-hour rest period between shifts.
 * Computes absolute end/start timestamps properly for overnight shifts.
 */
async function check10HourRest(staffId: string, newShift: ShiftData): Promise<string | null> {
  const shiftDate = new Date(newShift.date + 'T00:00:00');
  const dayBefore = addDays(newShift.date, -1);
  const dayAfter = addDays(newShift.date, 1);
  // For overnight new shifts that extend to day+2 we also check day+2
  const dayAfter2 = addDays(newShift.date, 2);

  const adjacentAssignments = await db
    .select({
      shift: {
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
      },
    })
    .from(shiftAssignments)
    .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
    .where(
      and(
        eq(shiftAssignments.staffId, staffId),
        or(
          eq(shifts.date, dayBefore),
          eq(shifts.date, newShift.date),
          eq(shifts.date, dayAfter),
          eq(shifts.date, dayAfter2)
        )
      )
    );

  // Compute absolute start/end for the new shift
  const newDateBase = shiftDate.getTime();
  const newRange = absoluteRange(newShift.startTime, newShift.endTime);
  const newAbsStart = newDateBase + newRange[0] * 60000;
  const newAbsEnd = newDateBase + newRange[1] * 60000;

  for (const assignment of adjacentAssignments) {
    const existingDateBase = new Date(assignment.shift.date + 'T00:00:00').getTime();
    const existingRange = absoluteRange(assignment.shift.startTime, assignment.shift.endTime);
    const existingAbsStart = existingDateBase + existingRange[0] * 60000;
    const existingAbsEnd = existingDateBase + existingRange[1] * 60000;

    // Hours between the new shift's start and the existing shift's end
    const hoursAfterExisting = (newAbsStart - existingAbsEnd) / (1000 * 60 * 60);
    // Hours between the existing shift's start and the new shift's end
    const hoursBeforeExisting = (existingAbsStart - newAbsEnd) / (1000 * 60 * 60);

    if (hoursAfterExisting > 0 && hoursAfterExisting < 10) {
      return `Only ${hoursAfterExisting.toFixed(1)} hours of rest after previous shift. Minimum 10 hours required.`;
    }

    if (hoursBeforeExisting > 0 && hoursBeforeExisting < 10) {
      return `Only ${hoursBeforeExisting.toFixed(1)} hours of rest before next shift. Minimum 10 hours required.`;
    }
  }

  return null;
}

/**
 * Check labor law limits (max consecutive days, daily hours, weekly hours).
 */
async function checkLaborLimits(
  staffId: string,
  newShift: ShiftData
): Promise<ConstraintViolation[]> {
  const violations: ConstraintViolation[] = [];

  const shiftHours = shiftDurationHours(newShift.startTime, newShift.endTime);

  // 1. Check daily hours limits
  const dailyHours = await getDailyHours(staffId, newShift.date);
  const totalDailyHours = dailyHours + shiftHours;

  if (totalDailyHours > 12) {
    violations.push({
      type: 'error',
      code: 'DAILY_HOURS_HARD_LIMIT',
      message: `This assignment would result in ${totalDailyHours.toFixed(1)} hours on ${newShift.date}. Cannot exceed 12 hours in a single day.`,
    });
  } else if (totalDailyHours > 8) {
    violations.push({
      type: 'warning',
      code: 'DAILY_HOURS_WARNING',
      message: `This assignment would result in ${totalDailyHours.toFixed(1)} hours on ${newShift.date}. Standard daily limit is 8 hours.`,
    });
  }

  // 2. Check weekly hours limits (overtime warnings)
  const weeklyHours = await getWeeklyHours(staffId, newShift.date);
  const totalWeeklyHours = weeklyHours + shiftHours;

  if (totalWeeklyHours >= 40) {
    violations.push({
      type: 'warning',
      code: 'WEEKLY_OVERTIME',
      message: `This assignment would result in ${totalWeeklyHours.toFixed(1)} hours this week. Overtime hours: ${(totalWeeklyHours - 40).toFixed(1)}`,
    });
  } else if (totalWeeklyHours >= 35) {
    violations.push({
      type: 'warning',
      code: 'WEEKLY_HOURS_APPROACHING_OVERTIME',
      message: `This assignment would result in ${totalWeeklyHours.toFixed(1)} hours this week. Approaching 40-hour overtime threshold.`,
    });
  }

  // 3. Check consecutive days worked
  const consecutiveDays = await getConsecutiveDays(staffId, newShift.date);

  if (consecutiveDays >= 7) {
    violations.push({
      type: 'error',
      code: 'SEVENTH_CONSECUTIVE_DAY',
      message: `Staff member would work their 7th consecutive day. This requires manager override with documented reason.`,
    });
  } else if (consecutiveDays >= 6) {
    violations.push({
      type: 'warning',
      code: 'SIXTH_CONSECUTIVE_DAY',
      message: `Staff member would work their 6th consecutive day. Consider scheduling a rest day.`,
    });
  }

  return violations;
}

// ── Hours / days helpers ─────────────────────────────────────────

async function getDailyHours(staffId: string, date: string): Promise<number> {
  const assignments = await db
    .select({
      startTime: shifts.startTime,
      endTime: shifts.endTime,
    })
    .from(shiftAssignments)
    .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
    .where(and(eq(shiftAssignments.staffId, staffId), eq(shifts.date, date)));

  let totalHours = 0;
  for (const assignment of assignments) {
    totalHours += shiftDurationHours(assignment.startTime, assignment.endTime);
  }

  return totalHours;
}

async function getWeeklyHours(staffId: string, date: string): Promise<number> {
  const shiftDate = new Date(date + 'T00:00:00');
  const dayOfWeek = shiftDate.getDay();
  const monday = new Date(shiftDate);
  monday.setDate(monday.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const assignments = await db
    .select({
      startTime: shifts.startTime,
      endTime: shifts.endTime,
    })
    .from(shiftAssignments)
    .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
    .where(
      and(
        eq(shiftAssignments.staffId, staffId),
        gte(shifts.date, formatDateLocal(monday)),
        lte(shifts.date, formatDateLocal(sunday))
      )
    );

  let totalHours = 0;
  for (const assignment of assignments) {
    totalHours += shiftDurationHours(assignment.startTime, assignment.endTime);
  }

  return totalHours;
}

async function getConsecutiveDays(staffId: string, date: string): Promise<number> {
  const shiftDate = new Date(date + 'T00:00:00');

  let daysBefore = 0;
  let currentDate = new Date(shiftDate);
  currentDate.setDate(currentDate.getDate() - 1);

  for (let i = 0; i < 14; i++) {
    const dateStr = formatDateLocal(currentDate);
    const assignments = await db
      .select()
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .where(and(eq(shiftAssignments.staffId, staffId), eq(shifts.date, dateStr)))
      .limit(1);

    if (assignments.length > 0) {
      daysBefore++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }

  let daysAfter = 0;
  currentDate = new Date(shiftDate);
  currentDate.setDate(currentDate.getDate() + 1);

  for (let i = 0; i < 14; i++) {
    const dateStr = formatDateLocal(currentDate);
    const assignments = await db
      .select()
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .where(and(eq(shiftAssignments.staffId, staffId), eq(shifts.date, dateStr)))
      .limit(1);

    if (assignments.length > 0) {
      daysAfter++;
      currentDate.setDate(currentDate.getDate() + 1);
    } else {
      break;
    }
  }

  return daysBefore + 1 + daysAfter;
}

// ── Suggestion helpers ───────────────────────────────────────────

async function findStaffWithSkill(skillId: string, locationId: string): Promise<Array<{ id: string; name: string }>> {
  const qualifiedStaff = await db
    .select({
      id: users.id,
      name: users.name,
    })
    .from(users)
    .innerJoin(staffSkills, eq(users.id, staffSkills.staffId))
    .innerJoin(staffLocationCerts, eq(users.id, staffLocationCerts.staffId))
    .where(
      and(
        eq(staffSkills.skillId, skillId),
        eq(staffLocationCerts.locationId, locationId),
        eq(users.role, 'STAFF')
      )
    )
    .limit(10);

  return qualifiedStaff;
}

/**
 * Get all qualified staff for a shift with their constraint validation results.
 */
export async function getQualifiedStaffForShift(
  shift: ShiftData
): Promise<Array<{ staff: { id: string; name: string; email: string }; validation: AssignmentValidationResult }>> {
  const qualifiedStaff = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .innerJoin(staffSkills, eq(users.id, staffSkills.staffId))
    .innerJoin(staffLocationCerts, eq(users.id, staffLocationCerts.staffId))
    .where(
      and(
        eq(staffSkills.skillId, shift.skillId),
        eq(staffLocationCerts.locationId, shift.locationId),
        eq(users.role, 'STAFF')
      )
    );

  const results = await Promise.all(
    qualifiedStaff.map(async (staff) => ({
      staff,
      validation: await validateAssignment(staff.id, shift),
    }))
  );

  return results.sort((a, b) => {
    if (a.validation.valid && !b.validation.valid) return -1;
    if (!a.validation.valid && b.validation.valid) return 1;
    return a.validation.violations.length - b.validation.violations.length;
  });
}
