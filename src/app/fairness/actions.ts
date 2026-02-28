'use server';

import { db } from '@/db';
import {
  users,
  shiftAssignments,
  shifts,
  locations,
  staffLocationCerts,
  managerLocations,
} from '@/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { formatDateLocal } from '@/lib/date-utils';

export interface StaffDistribution {
  staffId: string;
  staffName: string;
  totalHours: number;
  desirableShifts: number;
  totalShifts: number;
  desiredHours: number | null;
  variance: number; // Difference between totalHours and desiredHours
  status: 'over' | 'under' | 'balanced' | 'no_preference';
}

export interface FairnessReport {
  locationId: string;
  locationName: string;
  startDate: string;
  endDate: string;
  staffDistributions: StaffDistribution[];
  fairnessScore: number; // 0-100, higher is better
  totalDesirableShifts: number;
  insights: string[];
}

/**
 * Calculate if a shift is "desirable" (Friday/Saturday evening)
 */
function isDesirableShift(date: string, startTime: string): boolean {
  const shiftDate = new Date(date);
  const dayOfWeek = shiftDate.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday

  // Friday or Saturday
  if (dayOfWeek !== 5 && dayOfWeek !== 6) {
    return false;
  }

  // Evening shift (starts at or after 5pm / 17:00)
  const [hours] = startTime.split(':').map(Number);
  return hours >= 17;
}

/**
 * Calculate shift duration in hours
 */
function calculateShiftHours(startTime: string, endTime: string): number {
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);

  const startDate = new Date();
  startDate.setHours(startHours, startMinutes, 0, 0);

  const endDate = new Date();
  endDate.setHours(endHours, endMinutes, 0, 0);

  // Handle overnight shifts
  let hours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
  if (endDate <= startDate) {
    hours += 24;
  }

  return hours;
}

/**
 * Get fairness report for a location over a date range
 */
export async function getFairnessReport(
  locationId: string,
  startDate: Date,
  endDate: Date
): Promise<FairnessReport> {
  const user = await requireRole('MANAGER', 'ADMIN');

  // Verify access (managers can only access their locations)
  if (user.role === 'MANAGER') {
    const mgmtLocations = await db
      .select()
      .from(managerLocations)
      .where(eq(managerLocations.managerId, user.id));

    const hasAccess = mgmtLocations.some((ml) => ml.locationId === locationId);
    if (!hasAccess) {
      throw new Error('Unauthorized: You do not have access to this location');
    }
  }

  // Get location details
  const [location] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1);

  if (!location) {
    throw new Error('Location not found');
  }

  // Fetch all shifts with assignments for the date range
  const shiftsData = await db
    .select({
      shift: shifts,
      assignment: shiftAssignments,
      staff: users,
    })
    .from(shifts)
    .leftJoin(shiftAssignments, eq(shifts.id, shiftAssignments.shiftId))
    .leftJoin(users, eq(shiftAssignments.staffId, users.id))
    .where(
      and(
        eq(shifts.locationId, locationId),
        gte(shifts.date, formatDateLocal(startDate)),
        lte(shifts.date, formatDateLocal(endDate))
      )
    );

  // Calculate per-staff metrics
  const staffMap = new Map<string, {
    staffId: string;
    staffName: string;
    totalHours: number;
    desirableShifts: number;
    totalShifts: number;
    desiredHours: number | null;
  }>();

  let totalDesirableShifts = 0;

  for (const row of shiftsData) {
    if (!row.assignment || !row.staff) continue;

    const staffId = row.staff.id;
    const shiftHours = calculateShiftHours(row.shift.startTime, row.shift.endTime);
    const isDesirable = isDesirableShift(row.shift.date, row.shift.startTime);

    if (isDesirable) {
      totalDesirableShifts++;
    }

    if (!staffMap.has(staffId)) {
      staffMap.set(staffId, {
        staffId,
        staffName: row.staff.name,
        totalHours: 0,
        desirableShifts: 0,
        totalShifts: 0,
        desiredHours: row.staff.desiredHours,
      });
    }

    const staffData = staffMap.get(staffId)!;
    staffData.totalHours += shiftHours;
    staffData.totalShifts++;
    if (isDesirable) {
      staffData.desirableShifts++;
    }
  }

  // Calculate variance and status
  const staffDistributions: StaffDistribution[] = Array.from(staffMap.values()).map(
    (staff) => {
      let variance = 0;
      let status: StaffDistribution['status'] = 'no_preference';

      if (staff.desiredHours !== null) {
        variance = staff.totalHours - staff.desiredHours;
        if (variance > 5) {
          status = 'over';
        } else if (variance < -5) {
          status = 'under';
        } else {
          status = 'balanced';
        }
      }

      return {
        ...staff,
        variance,
        status,
      };
    }
  );

  // Calculate fairness score
  const fairnessScore = calculateFairnessScore(staffDistributions);

  // Generate insights
  const insights = generateInsights(staffDistributions, totalDesirableShifts);

  return {
    locationId,
    locationName: location.name,
    startDate: formatDateLocal(startDate),
    endDate: formatDateLocal(endDate),
    staffDistributions,
    fairnessScore,
    totalDesirableShifts,
    insights,
  };
}

/**
 * Calculate fairness score (0-100, higher is better)
 */
function calculateFairnessScore(
  staffDistributions: StaffDistribution[]
): number {
  if (staffDistributions.length === 0) return 100;

  // Factor 1: Desirable shift distribution (50% weight)
  const desirableShiftCounts = staffDistributions.map((s) => s.desirableShifts);
  const avgDesirable =
    desirableShiftCounts.reduce((a, b) => a + b, 0) / staffDistributions.length;
  const desirableVariance =
    desirableShiftCounts.reduce((sum, count) => sum + Math.pow(count - avgDesirable, 2), 0) /
    staffDistributions.length;
  const desirableStdDev = Math.sqrt(desirableVariance);

  // Lower std dev = more fair (normalize to 0-50)
  const desirableScore = Math.max(0, 50 - desirableStdDev * 10);

  // Factor 2: Hours vs desired hours adherence (50% weight)
  const staffWithPreferences = staffDistributions.filter((s) => s.desiredHours !== null);
  let adherenceScore = 50;

  if (staffWithPreferences.length > 0) {
    const avgVariance =
      staffWithPreferences.reduce((sum, s) => sum + Math.abs(s.variance), 0) /
      staffWithPreferences.length;
    // Lower variance = better (normalize to 0-50)
    adherenceScore = Math.max(0, 50 - avgVariance);
  }

  return Math.round(desirableScore + adherenceScore);
}

/**
 * Generate human-readable insights
 */
function generateInsights(
  staffDistributions: StaffDistribution[],
  totalDesirableShifts: number
): string[] {
  const insights: string[] = [];

  // Desirable shift concentration
  const staffWithDesirable = staffDistributions.filter((s) => s.desirableShifts > 0);
  const mostDesirableShifts = Math.max(...staffDistributions.map((s) => s.desirableShifts), 0);
  const staffWithMost = staffDistributions.filter((s) => s.desirableShifts === mostDesirableShifts);

  if (totalDesirableShifts > 0 && staffWithMost.length > 0 && mostDesirableShifts > 0) {
    const percentage = Math.round((mostDesirableShifts / totalDesirableShifts) * 100);
    if (percentage > 40 && staffWithMost.length === 1) {
      insights.push(
        `${staffWithMost[0].staffName} received ${percentage}% of all desirable shifts. Consider redistributing.`
      );
    }
  }

  // Over/under scheduled staff
  const overScheduled = staffDistributions.filter((s) => s.status === 'over');
  const underScheduled = staffDistributions.filter((s) => s.status === 'under');

  if (overScheduled.length > 0) {
    insights.push(
      `${overScheduled.length} staff member${overScheduled.length > 1 ? 's are' : ' is'} over-scheduled relative to desired hours.`
    );
  }

  if (underScheduled.length > 0) {
    insights.push(
      `${underScheduled.length} staff member${underScheduled.length > 1 ? 's are' : ' is'} under-scheduled relative to desired hours.`
    );
  }

  // No one with desirable shifts
  if (totalDesirableShifts > 0 && staffWithDesirable.length === 0) {
    insights.push('No staff were assigned desirable shifts during this period.');
  }

  // Balanced distribution
  if (insights.length === 0) {
    insights.push('Schedule distribution appears fair and balanced.');
  }

  return insights;
}

/**
 * Get list of staff at a location with their desired hours for management
 */
export async function getLocationStaff(locationId: string) {
  const user = await requireRole('MANAGER', 'ADMIN');

  // Verify access
  if (user.role === 'MANAGER') {
    const mgmtLocations = await db
      .select()
      .from(managerLocations)
      .where(eq(managerLocations.managerId, user.id));

    const hasAccess = mgmtLocations.some((ml) => ml.locationId === locationId);
    if (!hasAccess) {
      throw new Error('Unauthorized');
    }
  }

  // Get staff certified for this location
  const staffCerts = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      desiredHours: users.desiredHours,
    })
    .from(staffLocationCerts)
    .innerJoin(users, eq(staffLocationCerts.staffId, users.id))
    .where(eq(staffLocationCerts.locationId, locationId));

  return staffCerts;
}
