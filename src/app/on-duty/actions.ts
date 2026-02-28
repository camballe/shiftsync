'use server';

import { db } from '@/db';
import {
  shifts,
  shiftAssignments,
  users,
  locations,
  skills,
  managerLocations,
} from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { formatDateLocal } from '@/lib/date-utils';

export interface OnDutyStaff {
  staffId: string;
  staffName: string;
  staffEmail: string;
  shiftId: string;
  shiftStart: string;
  shiftEnd: string;
  skillName: string;
  locationId: string;
  locationName: string;
  locationTimezone: string;
}

/**
 * Get all staff currently on duty across all locations (for admins)
 * or specific locations (for managers)
 */
export async function getOnDutyStaff(): Promise<OnDutyStaff[]> {
  const user = await requireRole('MANAGER', 'ADMIN');

  // Get current date and time
  const now = new Date();
  const currentDate = formatDateLocal(now);

  // Get hours and minutes for time comparison
  const currentTime = now.toTimeString().split(' ')[0].substring(0, 5); // HH:MM format

  // Fetch currently active shifts with assignments
  const query = db
    .select({
      staff: users,
      shift: shifts,
      location: locations,
      skill: skills,
    })
    .from(shifts)
    .innerJoin(shiftAssignments, eq(shifts.id, shiftAssignments.shiftId))
    .innerJoin(users, eq(shiftAssignments.staffId, users.id))
    .innerJoin(locations, eq(shifts.locationId, locations.id))
    .innerJoin(skills, eq(shifts.skillId, skills.id))
    .where(
      and(
        eq(shifts.date, currentDate),
        eq(shifts.isPublished, true)
      )
    );

  const shiftsData = await query;

  // Filter for shifts that are currently active
  // Need to handle overnight shifts and timezone-aware comparisons
  const onDutyStaff: OnDutyStaff[] = [];

  for (const row of shiftsData) {
    const isCurrentlyActive = isShiftActive(
      row.shift.startTime,
      row.shift.endTime,
      currentTime
    );

    if (isCurrentlyActive) {
      // Check if user has access to this location (for managers)
      if (user.role === 'MANAGER') {
        const managerLocs = await db
          .select()
          .from(managerLocations)
          .where(eq(managerLocations.managerId, user.id));

        const hasAccess = managerLocs.some((ml) => ml.locationId === row.location.id);
        if (!hasAccess) continue;
      }

      onDutyStaff.push({
        staffId: row.staff.id,
        staffName: row.staff.name,
        staffEmail: row.staff.email,
        shiftId: row.shift.id,
        shiftStart: row.shift.startTime,
        shiftEnd: row.shift.endTime,
        skillName: row.skill.name,
        locationId: row.location.id,
        locationName: row.location.name,
        locationTimezone: row.location.timezone,
      });
    }
  }

  return onDutyStaff;
}

/**
 * Check if a shift is currently active based on start/end times
 * Handles overnight shifts (end time < start time)
 */
function isShiftActive(
  shiftStartTime: string,
  shiftEndTime: string,
  currentTime: string
): boolean {
  const [startHours, startMinutes] = shiftStartTime.split(':').map(Number);
  const [endHours, endMinutes] = shiftEndTime.split(':').map(Number);
  const [currentHours, currentMinutes] = currentTime.split(':').map(Number);

  const startTotalMinutes = startHours * 60 + startMinutes;
  const endTotalMinutes = endHours * 60 + endMinutes;
  const currentTotalMinutes = currentHours * 60 + currentMinutes;

  // Regular shift (not overnight)
  if (endTotalMinutes > startTotalMinutes) {
    return currentTotalMinutes >= startTotalMinutes && currentTotalMinutes < endTotalMinutes;
  }

  // Overnight shift (crosses midnight)
  // Active if current time is after start OR before end
  return currentTotalMinutes >= startTotalMinutes || currentTotalMinutes < endTotalMinutes;
}

/**
 * Get count of on-duty staff per location
 */
export async function getOnDutyCountByLocation(): Promise<Record<string, number>> {
  const onDutyStaff = await getOnDutyStaff();

  const countByLocation: Record<string, number> = {};

  for (const staff of onDutyStaff) {
    if (!countByLocation[staff.locationId]) {
      countByLocation[staff.locationId] = 0;
    }
    countByLocation[staff.locationId]++;
  }

  return countByLocation;
}
