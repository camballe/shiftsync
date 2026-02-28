'use server';

import { requireRole } from '@/lib/auth';
import { db } from '@/db';
import { shifts, shiftAssignments, users, locations } from '@/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { formatDateLocal } from '@/lib/date-utils';

export interface StaffOvertimeData {
  staffId: string;
  staffName: string;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  projectedOvertimeCost: number;
  shifts: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    hours: number;
    locationName: string;
  }[];
}

export interface WeeklyOvertimeReport {
  weekStart: string;
  weekEnd: string;
  totalRegularHours: number;
  totalOvertimeHours: number;
  totalProjectedCost: number;
  staffData: StaffOvertimeData[];
}

/**
 * Calculate weekly overtime for all staff at a location
 * Assumes: Regular rate $15/hr, Overtime rate $22.50/hr (1.5x)
 */
export async function getWeeklyOvertimeReport(
  locationId: string,
  weekStart: Date
): Promise<WeeklyOvertimeReport> {
  try {
    await requireRole('MANAGER', 'ADMIN');

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekStartStr = formatDateLocal(weekStart);
    const weekEndStr = formatDateLocal(weekEnd);

    // Get all shifts for this location in this week with assignments
    const weekShifts = await db
      .select({
        shiftId: shifts.id,
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        staffId: shiftAssignments.staffId,
        staffName: users.name,
        locationName: locations.name,
      })
      .from(shifts)
      .innerJoin(shiftAssignments, eq(shifts.id, shiftAssignments.shiftId))
      .innerJoin(users, eq(shiftAssignments.staffId, users.id))
      .innerJoin(locations, eq(shifts.locationId, locations.id))
      .where(
        and(
          eq(shifts.locationId, locationId),
          gte(shifts.date, weekStartStr),
          lte(shifts.date, weekEndStr)
        )
      )
      .orderBy(users.name, shifts.date, shifts.startTime);

    // Group by staff
    const staffMap = new Map<string, StaffOvertimeData>();

    for (const shift of weekShifts) {
      // Calculate shift hours
      const start = new Date(`2000-01-01T${shift.startTime}`);
      const end = new Date(`2000-01-01T${shift.endTime}`);
      let hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

      // Handle overnight shifts
      if (end <= start) {
        hours += 24;
      }

      if (!staffMap.has(shift.staffId)) {
        staffMap.set(shift.staffId, {
          staffId: shift.staffId,
          staffName: shift.staffName,
          regularHours: 0,
          overtimeHours: 0,
          totalHours: 0,
          projectedOvertimeCost: 0,
          shifts: [],
        });
      }

      const staffData = staffMap.get(shift.staffId)!;
      staffData.shifts.push({
        id: shift.shiftId,
        date: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
        hours,
        locationName: shift.locationName,
      });
      staffData.totalHours += hours;
    }

    // Calculate overtime
    const REGULAR_RATE = 15; // $15/hour
    const OVERTIME_RATE = 22.5; // $22.50/hour (1.5x)
    const OVERTIME_THRESHOLD = 40;

    let totalRegularHours = 0;
    let totalOvertimeHours = 0;
    let totalProjectedCost = 0;

    for (const staffData of staffMap.values()) {
      if (staffData.totalHours > OVERTIME_THRESHOLD) {
        staffData.regularHours = OVERTIME_THRESHOLD;
        staffData.overtimeHours = staffData.totalHours - OVERTIME_THRESHOLD;
        staffData.projectedOvertimeCost =
          OVERTIME_THRESHOLD * REGULAR_RATE +
          staffData.overtimeHours * OVERTIME_RATE;
      } else {
        staffData.regularHours = staffData.totalHours;
        staffData.overtimeHours = 0;
        staffData.projectedOvertimeCost = staffData.totalHours * REGULAR_RATE;
      }

      totalRegularHours += staffData.regularHours;
      totalOvertimeHours += staffData.overtimeHours;
      totalProjectedCost += staffData.projectedOvertimeCost;
    }

    return {
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      totalRegularHours,
      totalOvertimeHours,
      totalProjectedCost,
      staffData: Array.from(staffMap.values()).sort((a, b) =>
        b.overtimeHours - a.overtimeHours
      ),
    };
  } catch (error) {
    console.error('Error generating overtime report:', error);
    return {
      weekStart: formatDateLocal(weekStart),
      weekEnd: formatDateLocal(new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000)),
      totalRegularHours: 0,
      totalOvertimeHours: 0,
      totalProjectedCost: 0,
      staffData: [],
    };
  }
}

/**
 * What-if analysis: Calculate impact of assigning a staff member to a shift
 */
export async function analyzeAssignmentImpact(
  staffId: string,
  shiftDate: string,
  shiftStartTime: string,
  shiftEndTime: string
): Promise<{
  currentWeeklyHours: number;
  shiftHours: number;
  newWeeklyHours: number;
  currentDailyHours: number;
  newDailyHours: number;
  wouldCauseOvertime: boolean;
  overtimeHours: number;
  projectedCostImpact: number;
  warnings: string[];
}> {
  try {
    await requireRole('MANAGER', 'ADMIN');

    // Calculate shift hours
    const start = new Date(`2000-01-01T${shiftStartTime}`);
    const end = new Date(`2000-01-01T${shiftEndTime}`);
    let shiftHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    // Handle overnight shifts
    if (end <= start) {
      shiftHours += 24;
    }

    // Get week start for this date
    const shiftDateObj = new Date(shiftDate + 'T00:00:00');
    const dayOfWeek = shiftDateObj.getDay(); // 0 = Sunday
    const weekStart = new Date(shiftDateObj);
    weekStart.setDate(weekStart.getDate() - dayOfWeek);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Get current weekly hours
    const weeklyAssignments = await db
      .select({
        startTime: shifts.startTime,
        endTime: shifts.endTime,
      })
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .where(
        and(
          eq(shiftAssignments.staffId, staffId),
          gte(shifts.date, formatDateLocal(weekStart)),
          lte(shifts.date, formatDateLocal(weekEnd))
        )
      );

    let currentWeeklyHours = 0;
    for (const assignment of weeklyAssignments) {
      const start = new Date(`2000-01-01T${assignment.startTime}`);
      const end = new Date(`2000-01-01T${assignment.endTime}`);
      let hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      if (end <= start) hours += 24;
      currentWeeklyHours += hours;
    }

    // Get current daily hours
    const dailyAssignments = await db
      .select({
        startTime: shifts.startTime,
        endTime: shifts.endTime,
      })
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .where(
        and(
          eq(shiftAssignments.staffId, staffId),
          eq(shifts.date, shiftDate)
        )
      );

    let currentDailyHours = 0;
    for (const assignment of dailyAssignments) {
      const start = new Date(`2000-01-01T${assignment.startTime}`);
      const end = new Date(`2000-01-01T${assignment.endTime}`);
      let hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      if (end <= start) hours += 24;
      currentDailyHours += hours;
    }

    const newWeeklyHours = currentWeeklyHours + shiftHours;
    const newDailyHours = currentDailyHours + shiftHours;
    const wouldCauseOvertime = newWeeklyHours > 40;
    const overtimeHours = Math.max(0, newWeeklyHours - 40);

    // Calculate cost impact
    const REGULAR_RATE = 15;
    const OVERTIME_RATE = 22.5;

    let projectedCostImpact = 0;
    if (currentWeeklyHours >= 40) {
      // Already in overtime, all new hours are overtime
      projectedCostImpact = shiftHours * OVERTIME_RATE;
    } else if (newWeeklyHours > 40) {
      // Will push into overtime
      const regularHours = 40 - currentWeeklyHours;
      const overtimeHours = shiftHours - regularHours;
      projectedCostImpact =
        regularHours * REGULAR_RATE + overtimeHours * OVERTIME_RATE;
    } else {
      // All regular hours
      projectedCostImpact = shiftHours * REGULAR_RATE;
    }

    // Generate warnings
    const warnings: string[] = [];

    if (newDailyHours > 12) {
      warnings.push(`Would exceed 12-hour daily limit (${newDailyHours.toFixed(1)} hours)`);
    } else if (newDailyHours > 8) {
      warnings.push(`Would exceed 8-hour standard day (${newDailyHours.toFixed(1)} hours)`);
    }

    if (wouldCauseOvertime) {
      warnings.push(
        `Would cause ${overtimeHours.toFixed(1)} overtime hours this week`
      );
    } else if (newWeeklyHours >= 35) {
      warnings.push(`Approaching 40-hour overtime threshold (${newWeeklyHours.toFixed(1)} hours)`);
    }

    return {
      currentWeeklyHours,
      shiftHours,
      newWeeklyHours,
      currentDailyHours,
      newDailyHours,
      wouldCauseOvertime,
      overtimeHours,
      projectedCostImpact,
      warnings,
    };
  } catch (error) {
    console.error('Error analyzing assignment impact:', error);
    return {
      currentWeeklyHours: 0,
      shiftHours: 0,
      newWeeklyHours: 0,
      currentDailyHours: 0,
      newDailyHours: 0,
      wouldCauseOvertime: false,
      overtimeHours: 0,
      projectedCostImpact: 0,
      warnings: [],
    };
  }
}
