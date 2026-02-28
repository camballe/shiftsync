'use server';

import { requireRole } from '@/lib/auth';
import { db } from '@/db';
import { shifts, shiftAssignments, locations, skills, swapRequests, staffSkills, staffLocationCerts, users, managerLocations } from '@/db/schema';
import { eq, gte, and, sql, inArray } from 'drizzle-orm';
import { formatDateLocal } from '@/lib/date-utils';
import { revalidatePath } from 'next/cache';
import { createNotification } from '@/app/notifications/actions';

export interface MyShift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  isPublished: boolean;
  publishedAt: Date | null;
  location: {
    id: string;
    name: string;
    timezone: string;
  };
  skill: {
    id: string;
    name: string;
  };
  assignment: {
    id: string;
    assignedAt: Date;
  };
  pendingSwapRequest?: {
    id: string;
    type: 'SWAP' | 'DROP';
    status: string;
    createdAt: Date;
  } | null;
}

/**
 * Fetch all shifts assigned to the current staff member
 * Includes upcoming and recent past shifts
 */
export async function getMyShifts(daysBack: number = 7, daysForward: number = 60): Promise<MyShift[]> {
  try {
    const user = await requireRole('STAFF');

    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - daysBack);

    const endDate = new Date(today);
    endDate.setDate(today.getDate() + daysForward);

    // Fetch shifts assigned to this staff member
    const results = await db
      .select({
        shift: shifts,
        assignment: shiftAssignments,
        location: locations,
        skill: skills,
      })
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .innerJoin(locations, eq(shifts.locationId, locations.id))
      .innerJoin(skills, eq(shifts.skillId, skills.id))
      .where(
        and(
          eq(shiftAssignments.staffId, user.id),
          gte(shifts.date, formatDateLocal(startDate))
        )
      )
      .orderBy(shifts.date, shifts.startTime);

    // Get pending swap requests for these shifts
    const assignmentIds = results.map(r => r.assignment.id);
    const swaps = assignmentIds.length > 0
      ? await db
          .select()
          .from(swapRequests)
          .where(
            and(
              inArray(swapRequests.shiftAssignmentId, assignmentIds),
              eq(swapRequests.status, 'PENDING')
            )
          )
      : [];

    // Map to MyShift format
    const myShifts: MyShift[] = results.map(result => {
      const swap = swaps.find(s => s.shiftAssignmentId === result.assignment.id);

      return {
        id: result.shift.id,
        date: result.shift.date,
        startTime: result.shift.startTime,
        endTime: result.shift.endTime,
        isPublished: result.shift.isPublished,
        publishedAt: result.shift.publishedAt,
        location: {
          id: result.location.id,
          name: result.location.name,
          timezone: result.location.timezone,
        },
        skill: {
          id: result.skill.id,
          name: result.skill.name,
        },
        assignment: {
          id: result.assignment.id,
          assignedAt: result.assignment.assignedAt,
        },
        pendingSwapRequest: swap ? {
          id: swap.id,
          type: swap.type,
          status: swap.status,
          createdAt: swap.createdAt,
        } : null,
      };
    });

    return myShifts;
  } catch (error) {
    console.error('Error fetching my shifts:', error);
    return [];
  }
}

/**
 * Get count of pending swap/drop requests by the current user
 */
export async function getPendingSwapCount(): Promise<number> {
  try {
    const user = await requireRole('STAFF');

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(swapRequests)
      .where(
        and(
          eq(swapRequests.requestedBy, user.id),
          eq(swapRequests.status, 'PENDING')
        )
      );

    return result?.count || 0;
  } catch (error) {
    console.error('Error fetching pending swap count:', error);
    return 0;
  }
}

export interface AvailableShift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  location: {
    id: string;
    name: string;
    timezone: string;
  };
  skill: {
    id: string;
    name: string;
  };
  slotsAvailable: number;
}

/**
 * Get published shifts with available slots that the staff is qualified for.
 * Used to let staff pick up dropped/unfilled shifts.
 */
export async function getAvailableShifts(): Promise<AvailableShift[]> {
  try {
    const user = await requireRole('STAFF');
    const today = formatDateLocal(new Date());

    // Get staff qualifications in parallel
    const [mySkills, myCerts] = await Promise.all([
      db
        .select({ skillId: staffSkills.skillId })
        .from(staffSkills)
        .where(eq(staffSkills.staffId, user.id)),
      db
        .select({ locationId: staffLocationCerts.locationId })
        .from(staffLocationCerts)
        .where(eq(staffLocationCerts.staffId, user.id)),
    ]);

    if (mySkills.length === 0 || myCerts.length === 0) return [];

    const skillIds = mySkills.map(s => s.skillId);
    const locationIds = myCerts.map(c => c.locationId);

    // Get published future shifts matching qualifications
    const allShifts = await db
      .select({
        shift: shifts,
        location: locations,
        skill: skills,
      })
      .from(shifts)
      .innerJoin(locations, eq(shifts.locationId, locations.id))
      .innerJoin(skills, eq(shifts.skillId, skills.id))
      .where(
        and(
          eq(shifts.isPublished, true),
          gte(shifts.date, today),
          inArray(shifts.locationId, locationIds),
          inArray(shifts.skillId, skillIds)
        )
      )
      .orderBy(shifts.date, shifts.startTime);

    if (allShifts.length === 0) return [];

    // Get assignment counts for these shifts
    const shiftIds = allShifts.map(s => s.shift.id);
    const assignments = await db
      .select({
        shiftId: shiftAssignments.shiftId,
        count: sql<number>`count(*)::int`,
      })
      .from(shiftAssignments)
      .where(inArray(shiftAssignments.shiftId, shiftIds))
      .groupBy(shiftAssignments.shiftId);

    const assignmentCounts = new Map(assignments.map(a => [a.shiftId, a.count]));

    // Get existing assignments for overlap check
    const myAssignments = await db
      .select({
        shiftDate: shifts.date,
        shiftStart: shifts.startTime,
        shiftEnd: shifts.endTime,
      })
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .where(
        and(
          eq(shiftAssignments.staffId, user.id),
          gte(shifts.date, today)
        )
      );

    const available: AvailableShift[] = [];

    for (const row of allShifts) {
      const assigned = assignmentCounts.get(row.shift.id) || 0;
      const slotsAvailable = row.shift.headcount - assigned;

      if (slotsAvailable <= 0) continue;

      // Check for overlapping assignments on the same day
      const hasOverlap = myAssignments.some(a => {
        if (a.shiftDate !== row.shift.date) return false;
        return a.shiftStart < row.shift.endTime && a.shiftEnd > row.shift.startTime;
      });

      if (hasOverlap) continue;

      available.push({
        id: row.shift.id,
        date: row.shift.date,
        startTime: row.shift.startTime,
        endTime: row.shift.endTime,
        location: {
          id: row.location.id,
          name: row.location.name,
          timezone: row.location.timezone,
        },
        skill: {
          id: row.skill.id,
          name: row.skill.name,
        },
        slotsAvailable,
      });
    }

    return available;
  } catch (error) {
    console.error('Error fetching available shifts:', error);
    return [];
  }
}

/**
 * Staff picks up (self-assigns to) an available shift
 */
export async function pickUpShift(
  shiftId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireRole('STAFF');

    const [shift] = await db
      .select()
      .from(shifts)
      .where(eq(shifts.id, shiftId))
      .limit(1);

    if (!shift) return { success: false, error: 'Shift not found' };
    if (!shift.isPublished) return { success: false, error: 'Shift is not published' };

    // Check if shift is in the future
    const shiftDateTime = new Date(`${shift.date}T${shift.startTime}`);
    if (shiftDateTime <= new Date()) {
      return { success: false, error: 'Cannot pick up a shift that has already started' };
    }

    // Check capacity
    const [assignmentCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(shiftAssignments)
      .where(eq(shiftAssignments.shiftId, shiftId));

    if (assignmentCount.count >= shift.headcount) {
      return { success: false, error: 'This shift is already fully staffed' };
    }

    // Check if already assigned
    const [existing] = await db
      .select()
      .from(shiftAssignments)
      .where(and(eq(shiftAssignments.shiftId, shiftId), eq(shiftAssignments.staffId, user.id)))
      .limit(1);

    if (existing) {
      return { success: false, error: 'You are already assigned to this shift' };
    }

    // Create assignment (self-assigned)
    await db.insert(shiftAssignments).values({
      shiftId,
      staffId: user.id,
      assignedBy: user.id,
    });

    // Notify managers
    const managers = await db
      .select({ managerId: managerLocations.managerId })
      .from(managerLocations)
      .where(eq(managerLocations.locationId, shift.locationId));

    const [currentUser] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    for (const manager of managers) {
      await createNotification(
        manager.managerId,
        'SHIFT_PICKED_UP',
        'Shift Picked Up',
        `${currentUser?.name || 'A staff member'} picked up the shift on ${shift.date} (${shift.startTime.slice(0, 5)} - ${shift.endTime.slice(0, 5)}).`,
        'shift',
        shiftId
      );
    }

    revalidatePath('/my-shifts');
    revalidatePath('/schedules');

    return { success: true };
  } catch (error) {
    console.error('Error picking up shift:', error);
    return { success: false, error: 'Failed to pick up shift' };
  }
}
