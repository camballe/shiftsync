'use server';

import { requireRole } from '@/lib/auth';
import { db } from '@/db';
import { shifts, skills, shiftAssignments, swapRequests } from '@/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAuditLog } from '@/lib/audit';
import { createNotifications } from '@/app/notifications/actions';

// Validation schema for shift creation
const createShiftSchema = z.object({
  locationId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  skillId: z.string().uuid(),
  headcount: z.number().int().min(1).max(20),
});

// Validation schema for shift update
const updateShiftSchema = createShiftSchema.extend({
  shiftId: z.string().uuid(),
  version: z.number().int().min(1),
});

export async function createShift(formData: FormData) {
  try {
    const user = await requireRole('MANAGER', 'ADMIN');

    const parsed = createShiftSchema.safeParse({
      locationId: formData.get('locationId'),
      date: formData.get('date'),
      startTime: formData.get('startTime'),
      endTime: formData.get('endTime'),
      skillId: formData.get('skillId'),
      headcount: Number(formData.get('headcount')),
    });

    if (!parsed.success) {
      return { success: false, error: 'Invalid shift data' };
    }

    const { locationId, date, startTime, endTime, skillId, headcount } = parsed.data;

    // Allow overnight shifts: if endTime <= startTime, it's an overnight shift
    // No validation error for overnight shifts (e.g., 23:00 - 03:00)

    // Create shift
    const [newShift] = await db.insert(shifts).values({
      locationId,
      date,
      startTime,
      endTime,
      skillId,
      headcount,
      isPublished: false,
      createdBy: user.id,
      version: 1,
    }).returning();

    // Create audit log
    await createAuditLog('shift_created', user.id, newShift.id, {
      date,
      startTime,
      endTime,
      skillId,
      headcount,
    });

    revalidatePath(`/schedules/${locationId}`);

    return { success: true };
  } catch (error) {
    console.error('Error creating shift:', error);
    return { success: false, error: 'Failed to create shift' };
  }
}

export async function updateShift(formData: FormData) {
  try {
    const user = await requireRole('MANAGER', 'ADMIN');

    const parsed = updateShiftSchema.safeParse({
      shiftId: formData.get('shiftId'),
      locationId: formData.get('locationId'),
      date: formData.get('date'),
      startTime: formData.get('startTime'),
      endTime: formData.get('endTime'),
      skillId: formData.get('skillId'),
      headcount: Number(formData.get('headcount')),
      version: Number(formData.get('version')),
    });

    if (!parsed.success) {
      return { success: false, error: 'Invalid shift data' };
    }

    const { shiftId, locationId, date, startTime, endTime, skillId, headcount, version } = parsed.data;

    // Allow overnight shifts: if endTime <= startTime, it's an overnight shift
    // No validation error for overnight shifts (e.g., 23:00 - 03:00)

    // Atomic version-checked update (prevents TOCTOU race condition)
    const result = await db
      .update(shifts)
      .set({
        date,
        startTime,
        endTime,
        skillId,
        headcount,
        version: version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(shifts.id, shiftId), eq(shifts.version, version)))
      .returning({ id: shifts.id });

    if (result.length === 0) {
      // Distinguish "not found" from "version conflict"
      const [exists] = await db
        .select({ id: shifts.id })
        .from(shifts)
        .where(eq(shifts.id, shiftId))
        .limit(1);

      if (!exists) {
        return { success: false, error: 'Shift not found' };
      }
      return {
        success: false,
        error: 'Shift was modified by another user. Please refresh and try again.',
      };
    }

    // Create audit log
    await createAuditLog('shift_updated', user.id, shiftId, {
      date,
      startTime,
      endTime,
      skillId,
      headcount,
      previousVersion: version,
      newVersion: version + 1,
    });

    // Auto-cancel any pending swap requests for this shift's assignments
    const assignments = await db
      .select({ id: shiftAssignments.id, staffId: shiftAssignments.staffId })
      .from(shiftAssignments)
      .where(eq(shiftAssignments.shiftId, shiftId));

    if (assignments.length > 0) {
      const assignmentIds = assignments.map(a => a.id);

      // Get affected swap requests before cancelling
      const affectedSwaps = await db
        .select({ id: swapRequests.id, requestedBy: swapRequests.requestedBy })
        .from(swapRequests)
        .where(
          and(
            eq(swapRequests.status, 'PENDING'),
            inArray(swapRequests.shiftAssignmentId, assignmentIds)
          )
        );

      if (affectedSwaps.length > 0) {
        // Cancel pending swap requests
        await db
          .update(swapRequests)
          .set({
            status: 'CANCELLED',
            reviewNotes: 'Automatically cancelled because the shift was modified',
            updatedAt: new Date(),
          })
          .where(inArray(swapRequests.id, affectedSwaps.map(s => s.id)));

        // Notify affected staff
        const staffIds = [...new Set(affectedSwaps.map(s => s.requestedBy))];
        await createNotifications(
          staffIds,
          'SWAP_CANCELLED',
          'Request Auto-Cancelled',
          `Your swap/drop request was automatically cancelled because the shift on ${date} was modified by a manager.`,
          'shift',
          shiftId
        );
      }

      // Notify all assigned staff about the shift change
      const allAssignedStaffIds = [...new Set(assignments.map(a => a.staffId))];
      if (allAssignedStaffIds.length > 0) {
        await createNotifications(
          allAssignedStaffIds,
          'SHIFT_CHANGED',
          'Shift Modified',
          `A shift you're assigned to on ${date} (${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}) has been updated by a manager.`,
          'shift',
          shiftId
        );
      }
    }

    revalidatePath(`/schedules/${locationId}`);
    revalidatePath('/my-shifts');
    revalidatePath('/swap-requests');

    return { success: true };
  } catch (error) {
    console.error('Error updating shift:', error);
    return { success: false, error: 'Failed to update shift' };
  }
}

export async function deleteShift(shiftId: string, locationId: string) {
  try {
    const user = await requireRole('MANAGER', 'ADMIN');

    let shiftData: { date: string; startTime: string; endTime: string; skillId: string; headcount: number } | null = null;

    try {
      await db.transaction(async (tx) => {
        // Serialize operations on this shift to prevent race with concurrent edits
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${shiftId}))`);

        const [shift] = await tx
          .select()
          .from(shifts)
          .where(eq(shifts.id, shiftId))
          .limit(1);

        if (!shift) throw new Error('NOT_FOUND');

        if (shift.isPublished) {
          const shiftStartDateTime = new Date(`${shift.date}T${shift.startTime}`);
          const hoursUntilShift = (shiftStartDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
          if (hoursUntilShift <= 48) {
            throw new Error('TOO_CLOSE_TO_START');
          }
        }

        shiftData = {
          date: shift.date,
          startTime: shift.startTime,
          endTime: shift.endTime,
          skillId: shift.skillId,
          headcount: shift.headcount,
        };

        // Delete shift (cascade will handle assignments and swap requests)
        await tx.delete(shifts).where(eq(shifts.id, shiftId));
      });
    } catch (txError: unknown) {
      const msg = txError instanceof Error ? txError.message : '';
      if (msg === 'NOT_FOUND') return { success: false, error: 'Shift not found' };
      if (msg === 'TOO_CLOSE_TO_START') return { success: false, error: 'Cannot delete shift within 48 hours of its start time' };
      throw txError;
    }

    // Create audit log after successful delete
    if (shiftData) {
      await createAuditLog('shift_deleted', user.id, shiftId, shiftData);
    }

    revalidatePath(`/schedules/${locationId}`);

    return { success: true };
  } catch (error) {
    console.error('Error deleting shift:', error);
    return { success: false, error: 'Failed to delete shift' };
  }
}

export async function publishShift(shiftId: string, locationId: string) {
  try {
    const user = await requireRole('MANAGER', 'ADMIN');

    // Atomic publish: only succeeds if shift exists and is not already published
    const result = await db
      .update(shifts)
      .set({
        isPublished: true,
        publishedAt: new Date(),
        version: sql`${shifts.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(shifts.id, shiftId), eq(shifts.isPublished, false)))
      .returning({
        id: shifts.id,
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
      });

    if (result.length === 0) {
      const [exists] = await db
        .select({ id: shifts.id, isPublished: shifts.isPublished })
        .from(shifts)
        .where(eq(shifts.id, shiftId))
        .limit(1);

      if (!exists) return { success: false, error: 'Shift not found' };
      if (exists.isPublished) return { success: false, error: 'Shift is already published' };
      return { success: false, error: 'Failed to publish shift' };
    }

    const shift = result[0];

    // Create audit log
    await createAuditLog('shift_published', user.id, shiftId, {
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
    });

    // Get all assigned staff and notify them
    const assignments = await db
      .select({ staffId: shiftAssignments.staffId })
      .from(shiftAssignments)
      .where(eq(shiftAssignments.shiftId, shiftId));

    if (assignments.length > 0) {
      const staffIds = assignments.map(a => a.staffId);
      await createNotifications(
        staffIds,
        'SHIFT_PUBLISHED',
        'Shift Published',
        `Your shift on ${shift.date} (${shift.startTime.slice(0, 5)} - ${shift.endTime.slice(0, 5)}) has been published.`,
        'shift',
        shiftId
      );
    }

    revalidatePath(`/schedules/${locationId}`);
    revalidatePath('/my-shifts');

    return { success: true };
  } catch (error) {
    console.error('Error publishing shift:', error);
    return { success: false, error: 'Failed to publish shift' };
  }
}

export async function unpublishShift(shiftId: string, locationId: string) {
  try {
    const user = await requireRole('MANAGER', 'ADMIN');

    // First check if shift exists and get publishedAt for the 48-hour cutoff check
    const [shift] = await db
      .select({
        id: shifts.id,
        isPublished: shifts.isPublished,
        publishedAt: shifts.publishedAt,
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
      })
      .from(shifts)
      .where(eq(shifts.id, shiftId))
      .limit(1);

    if (!shift) {
      return { success: false, error: 'Shift not found' };
    }

    if (!shift.isPublished) {
      return { success: false, error: 'Shift is not published' };
    }

    // Check 48-hour cutoff — cannot unpublish within 48 hours of shift start
    const shiftStartDateTime = new Date(`${shift.date}T${shift.startTime}`);
    const hoursUntilShift = (shiftStartDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilShift <= 48) {
      return {
        success: false,
        error: 'Cannot unpublish shift within 48 hours of its start time',
      };
    }

    // Atomic unpublish: only succeeds if shift is still published
    const result = await db
      .update(shifts)
      .set({
        isPublished: false,
        publishedAt: null,
        version: sql`${shifts.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(shifts.id, shiftId), eq(shifts.isPublished, true)))
      .returning({ id: shifts.id });

    if (result.length === 0) {
      return { success: false, error: 'Shift was already unpublished by another user' };
    }

    // Create audit log
    await createAuditLog('shift_unpublished', user.id, shiftId, {
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
    });

    revalidatePath(`/schedules/${locationId}`);

    return { success: true };
  } catch (error) {
    console.error('Error unpublishing shift:', error);
    return { success: false, error: 'Failed to unpublish shift' };
  }
}

// Fetch available skills for form dropdown
export async function getSkills() {
  try {
    const skillsList = await db.select().from(skills);
    return { success: true, skills: skillsList };
  } catch (error) {
    console.error('Error fetching skills:', error);
    return { success: false, skills: [] };
  }
}
