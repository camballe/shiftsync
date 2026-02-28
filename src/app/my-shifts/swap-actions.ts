'use server';

import { requireRole } from '@/lib/auth';
import { db } from '@/db';
import {
  users,
  staffSkills,
  staffLocationCerts,
  shiftAssignments,
  shifts,
  swapRequests,
  availabilityRules,
  availabilityExceptions,
  managerLocations,
} from '@/db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { createNotification } from '@/app/notifications/actions';

interface EligibleStaff {
  id: string;
  name: string;
  email: string;
}

/**
 * Get staff members eligible to swap with for a specific shift
 * Requirements:
 * - Have the required skill
 * - Certified for the location
 * - Available during the shift time (based on availability rules)
 * - Not already assigned to an overlapping shift
 * - Not the same person requesting the swap
 */
export async function getEligibleStaffForSwap(
  assignmentId: string,
  shiftDate: string,
  shiftStartTime: string,
  shiftEndTime: string,
  skillId: string,
  locationId: string
): Promise<{ success: boolean; staff?: EligibleStaff[]; error?: string }> {
  try {
    const user = await requireRole('STAFF');

    // 1. Find all staff with the required skill
    const staffWithSkill = await db
      .select({ staffId: staffSkills.staffId })
      .from(staffSkills)
      .where(eq(staffSkills.skillId, skillId));

    if (staffWithSkill.length === 0) {
      return { success: true, staff: [] };
    }

    const staffIds = staffWithSkill.map(s => s.staffId);

    // 2. Filter by location certification
    const staffWithCert = await db
      .select({ staffId: staffLocationCerts.staffId })
      .from(staffLocationCerts)
      .where(
        and(
          eq(staffLocationCerts.locationId, locationId),
          inArray(staffLocationCerts.staffId, staffIds)
        )
      );

    if (staffWithCert.length === 0) {
      return { success: true, staff: [] };
    }

    const certifiedStaffIds = staffWithCert.map(s => s.staffId);

    // 3. Get day of week for availability check
    const date = new Date(shiftDate + 'T00:00:00');
    const dayOfWeek = (['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const)[date.getDay()];

    // 4. Check availability rules (recurring weekly patterns)
    const availableStaff = await db
      .select({ staffId: availabilityRules.staffId })
      .from(availabilityRules)
      .where(
        and(
          eq(availabilityRules.dayOfWeek, dayOfWeek),
          inArray(availabilityRules.staffId, certifiedStaffIds),
          sql`${availabilityRules.startTime} <= ${shiftStartTime}`,
          sql`${availabilityRules.endTime} >= ${shiftEndTime}`
        )
      );

    const availableStaffIds = availableStaff.map(s => s.staffId);

    // 5. Check for availability exceptions (specific date overrides)
    const exceptions = await db
      .select()
      .from(availabilityExceptions)
      .where(
        and(
          eq(availabilityExceptions.date, shiftDate),
          inArray(availabilityExceptions.staffId, availableStaffIds)
        )
      );

    // Filter out staff who are unavailable on this specific date
    const unavailableStaffIds = exceptions
      .filter(e => !e.isAvailable)
      .map(e => e.staffId);

    let finalAvailableIds = availableStaffIds.filter(
      id => !unavailableStaffIds.includes(id)
    );

    if (finalAvailableIds.length === 0) {
      return { success: true, staff: [] };
    }

    // 6. Check for overlapping shift assignments
    const overlappingAssignments = await db
      .select({ staffId: shiftAssignments.staffId })
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .where(
        and(
          eq(shifts.date, shiftDate),
          inArray(shiftAssignments.staffId, finalAvailableIds),
          sql`(
            (${shifts.startTime} < ${shiftEndTime} AND ${shifts.endTime} > ${shiftStartTime})
          )`
        )
      );

    const busyStaffIds = overlappingAssignments.map(a => a.staffId);
    finalAvailableIds = finalAvailableIds.filter(id => !busyStaffIds.includes(id));

    // 7. Exclude the current user
    finalAvailableIds = finalAvailableIds.filter(id => id !== user.id);

    if (finalAvailableIds.length === 0) {
      return { success: true, staff: [] };
    }

    // 8. Get user details
    const eligibleUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(users)
      .where(inArray(users.id, finalAvailableIds));

    return {
      success: true,
      staff: eligibleUsers,
    };
  } catch (error) {
    console.error('Error getting eligible staff:', error);
    return {
      success: false,
      error: 'Failed to fetch eligible staff',
    };
  }
}

/**
 * Create a swap request for a shift
 * Type: SWAP (swap with specific staff member)
 */
export async function createSwapRequest(
  assignmentId: string,
  targetStaffId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireRole('STAFF');

    // Check if user already has 3 pending requests
    const [pendingCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(swapRequests)
      .where(
        and(
          eq(swapRequests.requestedBy, user.id),
          eq(swapRequests.status, 'PENDING')
        )
      );

    if (pendingCount && pendingCount.count >= 3) {
      return {
        success: false,
        error: 'You already have 3 pending swap/drop requests. Please wait for approval or cancel existing requests.',
      };
    }

    // Verify the assignment belongs to the current user
    const [assignment] = await db
      .select()
      .from(shiftAssignments)
      .where(eq(shiftAssignments.id, assignmentId))
      .limit(1);

    if (!assignment) {
      return { success: false, error: 'Assignment not found' };
    }

    if (assignment.staffId !== user.id) {
      return { success: false, error: 'You can only request swaps for your own shifts' };
    }

    // Check if there's already a pending swap request for this assignment
    const [existingRequest] = await db
      .select()
      .from(swapRequests)
      .where(
        and(
          eq(swapRequests.shiftAssignmentId, assignmentId),
          eq(swapRequests.status, 'PENDING')
        )
      )
      .limit(1);

    if (existingRequest) {
      return {
        success: false,
        error: 'There is already a pending swap request for this shift',
      };
    }

    // Get shift details for notification
    const [shift] = await db
      .select({
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        locationId: shifts.locationId,
      })
      .from(shifts)
      .where(eq(shifts.id, assignment.shiftId))
      .limit(1);

    if (!shift) {
      return { success: false, error: 'Shift not found' };
    }

    // Create the swap request
    const [newRequest] = await db.insert(swapRequests).values({
      shiftAssignmentId: assignmentId,
      requestedBy: user.id,
      type: 'SWAP',
      targetStaffId,
      status: 'PENDING',
    }).returning();

    // Get user details for notification
    const [currentUser] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    // Notify target staff member (Staff B must accept before manager review)
    await createNotification(
      targetStaffId,
      'SWAP_REQUEST',
      'Swap Request — Your Acceptance Needed',
      `${currentUser?.name || 'A staff member'} wants to swap their shift on ${shift.date} (${shift.startTime.slice(0, 5)} - ${shift.endTime.slice(0, 5)}) with you. Please accept or decline.`,
      'swap_request',
      newRequest.id
    );

    // Note: Managers are only notified after the target staff accepts the swap

    revalidatePath('/my-shifts');
    revalidatePath('/swap-requests');

    return { success: true };
  } catch (error) {
    console.error('Error creating swap request:', error);
    return { success: false, error: 'Failed to create swap request' };
  }
}

/**
 * Create a drop request for a shift
 * Type: DROP (offer shift for anyone to pick up)
 */
export async function createDropRequest(
  assignmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireRole('STAFF');

    // Check if user already has 3 pending requests
    const [pendingCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(swapRequests)
      .where(
        and(
          eq(swapRequests.requestedBy, user.id),
          eq(swapRequests.status, 'PENDING')
        )
      );

    if (pendingCount && pendingCount.count >= 3) {
      return {
        success: false,
        error: 'You already have 3 pending swap/drop requests. Please wait for approval or cancel existing requests.',
      };
    }

    // Verify the assignment belongs to the current user
    const [assignment] = await db
      .select()
      .from(shiftAssignments)
      .where(eq(shiftAssignments.id, assignmentId))
      .limit(1);

    if (!assignment) {
      return { success: false, error: 'Assignment not found' };
    }

    if (assignment.staffId !== user.id) {
      return { success: false, error: 'You can only request drops for your own shifts' };
    }

    // Check if there's already a pending request for this assignment
    const [existingRequest] = await db
      .select()
      .from(swapRequests)
      .where(
        and(
          eq(swapRequests.shiftAssignmentId, assignmentId),
          eq(swapRequests.status, 'PENDING')
        )
      )
      .limit(1);

    if (existingRequest) {
      return {
        success: false,
        error: 'There is already a pending request for this shift',
      };
    }

    // Get shift details for 24-hour expiry check
    const [shift] = await db
      .select()
      .from(shifts)
      .where(eq(shifts.id, assignment.shiftId))
      .limit(1);

    if (!shift) {
      return { success: false, error: 'Shift not found' };
    }

    // Check if shift is within 24 hours
    const shiftDateTime = new Date(`${shift.date}T${shift.startTime}`);
    const now = new Date();
    const hoursUntilShift = (shiftDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilShift <= 24) {
      return {
        success: false,
        error: 'Cannot drop a shift within 24 hours of its start time',
      };
    }

    // Get user details for notification
    const [currentUser] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    // Create the drop request
    const [newRequest] = await db.insert(swapRequests).values({
      shiftAssignmentId: assignmentId,
      requestedBy: user.id,
      type: 'DROP',
      targetStaffId: null, // No specific target for drop requests
      status: 'PENDING',
    }).returning();

    // Notify managers of this location
    const managers = await db
      .select({ managerId: managerLocations.managerId })
      .from(managerLocations)
      .where(eq(managerLocations.locationId, shift.locationId));

    for (const manager of managers) {
      await createNotification(
        manager.managerId,
        'DROP_REQUEST',
        'Drop Request Pending',
        `${currentUser?.name || 'A staff member'} wants to drop their shift on ${shift.date} (${shift.startTime.slice(0, 5)} - ${shift.endTime.slice(0, 5)}).`,
        'swap_request',
        newRequest.id
      );
    }

    revalidatePath('/my-shifts');
    revalidatePath('/swap-requests');

    return { success: true };
  } catch (error) {
    console.error('Error creating drop request:', error);
    return { success: false, error: 'Failed to create drop request' };
  }
}

/**
 * Cancel a pending swap/drop request
 */
export async function cancelSwapRequest(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireRole('STAFF');

    // Verify the request belongs to the current user and is pending
    const [request] = await db
      .select()
      .from(swapRequests)
      .where(eq(swapRequests.id, requestId))
      .limit(1);

    if (!request) {
      return { success: false, error: 'Request not found' };
    }

    if (request.requestedBy !== user.id) {
      return { success: false, error: 'You can only cancel your own requests' };
    }

    if (request.status !== 'PENDING') {
      return { success: false, error: 'Only pending requests can be cancelled' };
    }

    // Update status to CANCELLED
    await db
      .update(swapRequests)
      .set({
        status: 'CANCELLED',
        updatedAt: new Date(),
      })
      .where(eq(swapRequests.id, requestId));

    // Notify target staff (if swap) that the request was cancelled
    if (request.targetStaffId) {
      await createNotification(
        request.targetStaffId,
        'SWAP_CANCELLED',
        'Swap Request Cancelled',
        'A swap request directed to you has been cancelled by the requester.',
        'swap_request',
        requestId
      );
    }

    revalidatePath('/my-shifts');
    revalidatePath('/swap-requests');

    return { success: true };
  } catch (error) {
    console.error('Error cancelling swap request:', error);
    return { success: false, error: 'Failed to cancel request' };
  }
}
