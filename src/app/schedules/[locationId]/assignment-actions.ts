'use server';

import { requireRole } from '@/lib/auth';
import { db } from '@/db';
import { shiftAssignments, shifts, skills, users } from '@/db/schema';
import { eq, and, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { validateAssignment } from '@/lib/constraints';
import { createAuditLog } from '@/lib/audit';
import { createNotification } from '@/app/notifications/actions';

export async function assignStaffToShift(
  shiftId: string,
  staffId: string,
  locationId: string,
  overrideReason?: string
) {
  try {
    const user = await requireRole('MANAGER', 'ADMIN');

    // Get shift data for validation
    const [shiftRow] = await db
      .select()
      .from(shifts)
      .where(eq(shifts.id, shiftId))
      .limit(1);

    if (!shiftRow) {
      return { success: false, error: 'Shift not found' };
    }

    // Validate assignment against all constraints
    const validation = await validateAssignment(staffId, {
      id: shiftRow.id,
      locationId: shiftRow.locationId,
      date: shiftRow.date,
      startTime: shiftRow.startTime,
      endTime: shiftRow.endTime,
      skillId: shiftRow.skillId,
    });

    if (!validation.valid) {
      const errors = validation.violations.filter((v) => v.type === 'error');
      const onlySeventhDay =
        errors.length === 1 && errors[0].code === 'SEVENTH_CONSECUTIVE_DAY';

      if (onlySeventhDay && overrideReason && overrideReason.trim().length > 0) {
        // Manager override with documented reason — allow assignment
      } else {
        const errorMessages = errors.map((v) => v.message).join('; ');
        return {
          success: false,
          error: errorMessages,
          overridable: onlySeventhDay,
        };
      }
    }

    // Use a transaction with an advisory lock on the staff member
    // to prevent concurrent double-booking (race condition).
    try {
      await db.transaction(async (tx) => {
        // Serialize all assignment operations for this staff member
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${staffId}))`);

        // Re-check for overlapping shifts within the lock
        // Check same-day and adjacent days (for overnight shifts)
        const datesToCheck = [shiftRow.date];
        // Add previous day (an overnight shift from yesterday could extend into today)
        const prevDay = new Date(shiftRow.date + 'T00:00:00');
        prevDay.setDate(prevDay.getDate() - 1);
        const prevDateStr = prevDay.toISOString().slice(0, 10);
        datesToCheck.push(prevDateStr);
        // If new shift is overnight, add next day too
        if (shiftRow.endTime <= shiftRow.startTime) {
          const nextDay = new Date(shiftRow.date + 'T00:00:00');
          nextDay.setDate(nextDay.getDate() + 1);
          datesToCheck.push(nextDay.toISOString().slice(0, 10));
        }

        const nearbyAssignments = await tx
          .select({
            shiftId: shifts.id,
            date: shifts.date,
            startTime: shifts.startTime,
            endTime: shifts.endTime,
          })
          .from(shiftAssignments)
          .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
          .where(
            and(
              eq(shiftAssignments.staffId, staffId),
              sql`${shifts.date} = ANY(${datesToCheck})`,
              ne(shifts.id, shiftId)
            )
          );

        // Helper to convert shift to absolute epoch range
        const toEpochRange = (date: string, start: string, end: string): [number, number] => {
          const startEpoch = new Date(`${date}T${start}`).getTime();
          let endEpoch = new Date(`${date}T${end}`).getTime();
          if (endEpoch <= startEpoch) endEpoch += 24 * 60 * 60 * 1000; // overnight
          return [startEpoch, endEpoch];
        };

        const [newAbsStart, newAbsEnd] = toEpochRange(shiftRow.date, shiftRow.startTime, shiftRow.endTime);

        for (const existing of nearbyAssignments) {
          const [existAbsStart, existAbsEnd] = toEpochRange(existing.date, existing.startTime, existing.endTime);
          if (newAbsStart < existAbsEnd && existAbsStart < newAbsEnd) {
            throw new Error('DOUBLE_BOOKING');
          }
        }

        // Check if already assigned to this exact shift
        const duplicate = await tx
          .select()
          .from(shiftAssignments)
          .where(
            and(
              eq(shiftAssignments.shiftId, shiftId),
              eq(shiftAssignments.staffId, staffId)
            )
          )
          .limit(1);

        if (duplicate.length > 0) {
          throw new Error('ALREADY_ASSIGNED');
        }

        // Insert assignment
        await tx.insert(shiftAssignments).values({
          shiftId,
          staffId,
          assignedBy: user.id,
        });
      });
    } catch (txError: unknown) {
      const msg = txError instanceof Error ? txError.message : '';
      if (msg === 'DOUBLE_BOOKING') {
        return {
          success: false,
          error: 'Staff member has a conflicting shift at this time. They were just assigned to an overlapping shift by another manager.',
        };
      }
      if (msg === 'ALREADY_ASSIGNED') {
        return { success: false, error: 'Staff is already assigned to this shift' };
      }
      throw txError;
    }

    // Create audit log
    await createAuditLog('assignment_created', user.id, shiftId, {
      staffId,
      warnings: validation.violations
        .filter((v) => v.type === 'warning')
        .map((v) => v.code),
      ...(overrideReason ? { overrideReason, overrideCode: 'SEVENTH_CONSECUTIVE_DAY' } : {}),
    });

    // Send notification to assigned staff
    await createNotification(
      staffId,
      'SHIFT_ASSIGNED',
      'New Shift Assigned',
      `You've been assigned to a shift on ${shiftRow.date} (${shiftRow.startTime.slice(0, 5)} - ${shiftRow.endTime.slice(0, 5)})${shiftRow.isPublished ? '' : ' (draft - not yet published)'}.`,
      'shift',
      shiftId
    );

    revalidatePath(`/schedules/${locationId}`);
    revalidatePath('/my-shifts');

    return {
      success: true,
      warnings: validation.violations
        .filter((v) => v.type === 'warning')
        .map((v) => v.message),
    };
  } catch (error) {
    console.error('Error assigning staff:', error);
    return { success: false, error: 'Failed to assign staff' };
  }
}

export async function unassignStaffFromShift(
  shiftId: string,
  staffId: string,
  locationId: string
) {
  try {
    const user = await requireRole('MANAGER', 'ADMIN');

    await db
      .delete(shiftAssignments)
      .where(
        and(
          eq(shiftAssignments.shiftId, shiftId),
          eq(shiftAssignments.staffId, staffId)
        )
      );

    // Create audit log
    await createAuditLog('assignment_deleted', user.id, shiftId, {
      staffId,
    });

    revalidatePath(`/schedules/${locationId}`);

    return { success: true };
  } catch (error) {
    console.error('Error unassigning staff:', error);
    return { success: false, error: 'Failed to unassign staff' };
  }
}

export async function getShiftWithQualifiedStaff(shiftId: string) {
  try {
    await requireRole('MANAGER', 'ADMIN');

    // Get shift details with skill
    const [shiftRow] = await db
      .select({
        id: shifts.id,
        locationId: shifts.locationId,
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        skillId: shifts.skillId,
        headcount: shifts.headcount,
        isPublished: shifts.isPublished,
        skill: {
          id: skills.id,
          name: skills.name,
        },
      })
      .from(shifts)
      .innerJoin(skills, eq(shifts.skillId, skills.id))
      .where(eq(shifts.id, shiftId))
      .limit(1);

    if (!shiftRow) {
      return { success: false, error: 'Shift not found' };
    }

    // Get current assignments with staff info
    const assignmentRows = await db
      .select({
        assignment: {
          id: shiftAssignments.id,
          shiftId: shiftAssignments.shiftId,
          staffId: shiftAssignments.staffId,
        },
        staff: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(shiftAssignments)
      .innerJoin(users, eq(shiftAssignments.staffId, users.id))
      .where(eq(shiftAssignments.shiftId, shiftId));

    const shift = {
      ...shiftRow,
      assignments: assignmentRows,
    };

    // Get qualified staff with validation results
    const { getQualifiedStaffForShift } = await import('@/lib/constraints');
    const qualifiedStaff = await getQualifiedStaffForShift({
      id: shift.id,
      locationId: shift.locationId,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      skillId: shift.skillId,
    });

    return {
      success: true,
      shift,
      qualifiedStaff,
    };
  } catch (error) {
    console.error('Error fetching qualified staff:', error);
    return { success: false, error: 'Failed to fetch qualified staff' };
  }
}
