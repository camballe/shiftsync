'use server';

import { requireRole, requireAuth } from '@/lib/auth';
import { db } from '@/db';
import {
  swapRequests,
  shiftAssignments,
  shifts,
  locations,
  skills,
  users,
  managerLocations,
} from '@/db/schema';
import { eq, and, inArray, sql, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { createAuditLog } from '@/lib/audit';
import { createNotification } from '@/app/notifications/actions';

export interface SwapRequestDetail {
  id: string;
  type: 'SWAP' | 'DROP';
  status: string;
  createdAt: Date;
  updatedAt: Date;
  shift: {
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
  };
  requestedBy: {
    id: string;
    name: string;
    email: string;
  };
  targetStaff?: {
    id: string;
    name: string;
    email: string;
  } | null;
  reviewedBy?: {
    id: string;
    name: string;
  } | null;
  reviewedAt?: Date | null;
  reviewNotes?: string | null;
}

/**
 * Auto-expire drop requests that are within 24 hours of shift start
 */
async function expireOldDropRequests() {
  try {
    // Get all pending DROP requests
    const pendingDrops = await db
      .select({
        id: swapRequests.id,
        shiftAssignmentId: swapRequests.shiftAssignmentId,
      })
      .from(swapRequests)
      .where(
        and(
          eq(swapRequests.type, 'DROP'),
          eq(swapRequests.status, 'PENDING')
        )
      );

    if (pendingDrops.length === 0) return;

    // Get shift details for each drop request
    const assignmentIds = pendingDrops.map(d => d.shiftAssignmentId);
    const shiftsToCheck = await db
      .select({
        assignmentId: shiftAssignments.id,
        shiftDate: shifts.date,
        shiftStartTime: shifts.startTime,
      })
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .where(inArray(shiftAssignments.id, assignmentIds));

    // Check which ones are within 24 hours
    const now = new Date();
    const expiredRequestIds: string[] = [];

    for (const shift of shiftsToCheck) {
      const shiftDateTime = new Date(`${shift.shiftDate}T${shift.shiftStartTime}`);
      const hoursUntilShift = (shiftDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilShift <= 24) {
        // Find the corresponding drop request
        const dropRequest = pendingDrops.find(d => d.shiftAssignmentId === shift.assignmentId);
        if (dropRequest) {
          expiredRequestIds.push(dropRequest.id);
        }
      }
    }

    // Expire the requests
    if (expiredRequestIds.length > 0) {
      await db
        .update(swapRequests)
        .set({
          status: 'CANCELLED',
          reviewNotes: 'Automatically expired (shift starts within 24 hours)',
          updatedAt: new Date(),
        })
        .where(inArray(swapRequests.id, expiredRequestIds));
    }
  } catch (error) {
    console.error('Error expiring drop requests:', error);
  }
}

/**
 * Get all swap/drop requests for locations the manager has access to
 */
export async function getSwapRequestsForManager(): Promise<SwapRequestDetail[]> {
  try {
    await requireRole('MANAGER', 'ADMIN');

    // First, expire old drop requests
    await expireOldDropRequests();

    // Get all pending swap requests
    const requests = await db
      .select({
        swapRequest: swapRequests,
        shift: shifts,
        location: locations,
        skill: skills,
        assignment: shiftAssignments,
      })
      .from(swapRequests)
      .innerJoin(shiftAssignments, eq(swapRequests.shiftAssignmentId, shiftAssignments.id))
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .innerJoin(locations, eq(shifts.locationId, locations.id))
      .innerJoin(skills, eq(shifts.skillId, skills.id))
      .where(
        or(
          // Drop requests pending manager approval
          and(eq(swapRequests.status, 'PENDING'), eq(swapRequests.type, 'DROP')),
          // Swap requests accepted by target, pending manager approval
          and(eq(swapRequests.status, 'ACCEPTED_BY_TARGET'), eq(swapRequests.type, 'SWAP'))
        )
      )
      .orderBy(swapRequests.createdAt);

    // Get user details for requestedBy, targetStaffId, and reviewedBy
    const userIds = new Set<string>();
    requests.forEach(r => {
      userIds.add(r.swapRequest.requestedBy);
      if (r.swapRequest.targetStaffId) userIds.add(r.swapRequest.targetStaffId);
      if (r.swapRequest.reviewedBy) userIds.add(r.swapRequest.reviewedBy);
      userIds.add(r.assignment.staffId);
    });

    const usersData = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(users)
      .where(inArray(users.id, Array.from(userIds)));

    const usersMap = new Map(usersData.map(u => [u.id, u]));

    // Map to SwapRequestDetail format
    const swapRequestDetails: SwapRequestDetail[] = requests.map(r => {
      const requestedByUser = usersMap.get(r.swapRequest.requestedBy);
      const targetStaffUser = r.swapRequest.targetStaffId
        ? usersMap.get(r.swapRequest.targetStaffId)
        : null;
      const reviewedByUser = r.swapRequest.reviewedBy
        ? usersMap.get(r.swapRequest.reviewedBy)
        : null;

      return {
        id: r.swapRequest.id,
        type: r.swapRequest.type,
        status: r.swapRequest.status,
        createdAt: r.swapRequest.createdAt,
        updatedAt: r.swapRequest.updatedAt,
        shift: {
          id: r.shift.id,
          date: r.shift.date,
          startTime: r.shift.startTime,
          endTime: r.shift.endTime,
          location: {
            id: r.location.id,
            name: r.location.name,
            timezone: r.location.timezone,
          },
          skill: {
            id: r.skill.id,
            name: r.skill.name,
          },
        },
        requestedBy: requestedByUser || {
          id: r.swapRequest.requestedBy,
          name: 'Unknown',
          email: 'unknown@example.com',
        },
        targetStaff: targetStaffUser || null,
        reviewedBy: reviewedByUser
          ? { id: reviewedByUser.id, name: reviewedByUser.name }
          : null,
        reviewedAt: r.swapRequest.reviewedAt,
        reviewNotes: r.swapRequest.reviewNotes,
      };
    });

    return swapRequestDetails;
  } catch (error) {
    console.error('Error fetching swap requests:', error);
    return [];
  }
}

/**
 * Approve a swap/drop request
 * For SWAP: reassign the shift to the target staff
 * For DROP: remove the current assignment (shift becomes unfilled)
 */
export async function approveSwapRequest(
  requestId: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireRole('MANAGER', 'ADMIN');

    let requestType: 'SWAP' | 'DROP' = 'DROP';
    let requestedBy = '';
    let targetStaffId: string | null = null;
    let assignmentId = '';
    let assignmentShiftId = '';
    let assignmentStaffId = '';

    try {
      await db.transaction(async (tx) => {
        // Serialize all operations for this swap request
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${requestId}))`);

        const [request] = await tx
          .select()
          .from(swapRequests)
          .where(eq(swapRequests.id, requestId))
          .limit(1);

        if (!request) throw new Error('NOT_FOUND');
        // For SWAP: manager can only approve after target staff accepts
        if (request.type === 'SWAP' && request.status !== 'ACCEPTED_BY_TARGET') throw new Error('NOT_READY');
        // For DROP: manager approves from PENDING
        if (request.type === 'DROP' && request.status !== 'PENDING') throw new Error('NOT_PENDING');

        requestType = request.type;
        requestedBy = request.requestedBy;
        targetStaffId = request.targetStaffId;

        // Get the shift assignment
        const [assignment] = await tx
          .select()
          .from(shiftAssignments)
          .where(eq(shiftAssignments.id, request.shiftAssignmentId))
          .limit(1);

        if (!assignment) throw new Error('ASSIGNMENT_NOT_FOUND');

        assignmentId = assignment.id;
        assignmentShiftId = assignment.shiftId;
        assignmentStaffId = assignment.staffId;

        // Update request status
        await tx
          .update(swapRequests)
          .set({
            status: 'APPROVED',
            reviewedBy: user.id,
            reviewedAt: new Date(),
            reviewNotes: notes,
            updatedAt: new Date(),
          })
          .where(eq(swapRequests.id, requestId));

        if (request.type === 'SWAP' && request.targetStaffId) {
          // Reassign shift to target staff
          await tx
            .update(shiftAssignments)
            .set({
              staffId: request.targetStaffId,
              assignedBy: user.id,
              assignedAt: new Date(),
            })
            .where(eq(shiftAssignments.id, assignment.id));
        } else if (request.type === 'DROP') {
          // Remove the assignment
          await tx
            .delete(shiftAssignments)
            .where(eq(shiftAssignments.id, assignment.id));
        }
      });
    } catch (txError: unknown) {
      const msg = txError instanceof Error ? txError.message : '';
      if (msg === 'NOT_FOUND') return { success: false, error: 'Swap request not found' };
      if (msg === 'NOT_PENDING') return { success: false, error: 'This request has already been processed by another manager' };
      if (msg === 'NOT_READY') return { success: false, error: 'Target staff has not yet accepted this swap request' };
      if (msg === 'ASSIGNMENT_NOT_FOUND') return { success: false, error: 'Shift assignment not found' };
      throw txError;
    }

    // Get shift details for notifications (outside transaction)
    const [shift] = await db
      .select({
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
      })
      .from(shifts)
      .where(eq(shifts.id, assignmentShiftId))
      .limit(1);

    // Audit log and notifications (outside transaction)
    if ((requestType as string) === 'SWAP' && targetStaffId) {
      await createAuditLog('shift_assignment_updated', user.id, assignmentShiftId, {
        previousStaffId: assignmentStaffId,
        newStaffId: targetStaffId,
        reason: 'swap_approved',
        swapRequestId: requestId,
      });

      await createNotification(
        requestedBy,
        'SWAP_APPROVED',
        'Swap Request Approved',
        `Your swap request for ${shift?.date} (${shift?.startTime.slice(0, 5)} - ${shift?.endTime.slice(0, 5)}) has been approved.`,
        'swap_request',
        requestId
      );

      await createNotification(
        targetStaffId,
        'SWAP_APPROVED',
        "Swap Approved - You're Now Assigned",
        `You've been assigned to a shift on ${shift?.date} (${shift?.startTime.slice(0, 5)} - ${shift?.endTime.slice(0, 5)}) via swap.`,
        'shift_assignment',
        assignmentId
      );
    } else if ((requestType as string) === 'DROP') {
      await createAuditLog('shift_assignment_removed', user.id, assignmentShiftId, {
        staffId: assignmentStaffId,
        reason: 'drop_approved',
        swapRequestId: requestId,
      });

      await createNotification(
        requestedBy,
        'DROP_APPROVED',
        'Drop Request Approved',
        `Your request to drop the shift on ${shift?.date} (${shift?.startTime.slice(0, 5)} - ${shift?.endTime.slice(0, 5)}) has been approved. You are no longer assigned.`,
        'swap_request',
        requestId
      );
    }

    revalidatePath('/swap-requests');
    revalidatePath('/my-shifts');
    revalidatePath('/schedules');

    return { success: true };
  } catch (error) {
    console.error('Error approving swap request:', error);
    return { success: false, error: 'Failed to approve swap request' };
  }
}

/**
 * Deny a swap/drop request
 */
export async function denySwapRequest(
  requestId: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireRole('MANAGER', 'ADMIN');

    let requestType: 'SWAP' | 'DROP' = 'DROP';
    let requestedBy = '';
    let targetStaffId: string | null = null;
    let assignmentShiftId = '';

    try {
      await db.transaction(async (tx) => {
        // Serialize all operations for this swap request
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${requestId}))`);

        const [request] = await tx
          .select()
          .from(swapRequests)
          .where(eq(swapRequests.id, requestId))
          .limit(1);

        if (!request) throw new Error('NOT_FOUND');
        if (request.status !== 'PENDING' && request.status !== 'ACCEPTED_BY_TARGET') throw new Error('NOT_PENDING');

        requestType = request.type;
        requestedBy = request.requestedBy;
        targetStaffId = request.targetStaffId;

        // Get shift assignment for shift ID
        const [assignment] = await tx
          .select({ shiftId: shiftAssignments.shiftId })
          .from(shiftAssignments)
          .where(eq(shiftAssignments.id, request.shiftAssignmentId))
          .limit(1);

        assignmentShiftId = assignment?.shiftId || '';

        // Update request status
        await tx
          .update(swapRequests)
          .set({
            status: 'DENIED',
            reviewedBy: user.id,
            reviewedAt: new Date(),
            reviewNotes: notes,
            updatedAt: new Date(),
          })
          .where(eq(swapRequests.id, requestId));
      });
    } catch (txError: unknown) {
      const msg = txError instanceof Error ? txError.message : '';
      if (msg === 'NOT_FOUND') return { success: false, error: 'Swap request not found' };
      if (msg === 'NOT_PENDING') return { success: false, error: 'This request has already been processed by another manager' };
      throw txError;
    }

    // Get shift details for notifications (outside transaction)
    const [shift] = assignmentShiftId ? await db
      .select({
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
      })
      .from(shifts)
      .where(eq(shifts.id, assignmentShiftId))
      .limit(1) : [null];

    // Notify requester
    const isDenySwap = (requestType as string) === 'SWAP';
    await createNotification(
      requestedBy,
      isDenySwap ? 'SWAP_DENIED' : 'DROP_DENIED',
      `${isDenySwap ? 'Swap' : 'Drop'} Request Denied`,
      `Your request to ${isDenySwap ? 'swap' : 'drop'} the shift on ${shift?.date} (${shift?.startTime.slice(0, 5)} - ${shift?.endTime.slice(0, 5)}) was not approved.${notes ? ` Reason: ${notes}` : ''}`,
      'swap_request',
      requestId
    );

    // If swap, notify target staff that it was denied
    if (isDenySwap && targetStaffId) {
      await createNotification(
        targetStaffId,
        'SWAP_DENIED',
        'Swap Request Denied',
        `A swap request for ${shift?.date} was denied by a manager.`,
        'swap_request',
        requestId
      );
    }

    revalidatePath('/swap-requests');
    revalidatePath('/my-shifts');

    return { success: true };
  } catch (error) {
    console.error('Error denying swap request:', error);
    return { success: false, error: 'Failed to deny swap request' };
  }
}

/**
 * Get swap/drop requests created by the current staff member
 */
export async function getMySwapRequests(): Promise<SwapRequestDetail[]> {
  try {
    const user = await requireAuth();

    await expireOldDropRequests();

    const requests = await db
      .select({
        swapRequest: swapRequests,
        shift: shifts,
        location: locations,
        skill: skills,
        assignment: shiftAssignments,
      })
      .from(swapRequests)
      .innerJoin(shiftAssignments, eq(swapRequests.shiftAssignmentId, shiftAssignments.id))
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .innerJoin(locations, eq(shifts.locationId, locations.id))
      .innerJoin(skills, eq(shifts.skillId, skills.id))
      .where(eq(swapRequests.requestedBy, user.id))
      .orderBy(swapRequests.createdAt);

    const userIds = new Set<string>();
    requests.forEach(r => {
      userIds.add(r.swapRequest.requestedBy);
      if (r.swapRequest.targetStaffId) userIds.add(r.swapRequest.targetStaffId);
      if (r.swapRequest.reviewedBy) userIds.add(r.swapRequest.reviewedBy);
    });

    const usersData = userIds.size > 0
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, Array.from(userIds)))
      : [];

    const usersMap = new Map(usersData.map(u => [u.id, u]));

    return requests.map(r => {
      const requestedByUser = usersMap.get(r.swapRequest.requestedBy);
      const targetStaffUser = r.swapRequest.targetStaffId
        ? usersMap.get(r.swapRequest.targetStaffId)
        : null;
      const reviewedByUser = r.swapRequest.reviewedBy
        ? usersMap.get(r.swapRequest.reviewedBy)
        : null;

      return {
        id: r.swapRequest.id,
        type: r.swapRequest.type,
        status: r.swapRequest.status,
        createdAt: r.swapRequest.createdAt,
        updatedAt: r.swapRequest.updatedAt,
        shift: {
          id: r.shift.id,
          date: r.shift.date,
          startTime: r.shift.startTime,
          endTime: r.shift.endTime,
          location: {
            id: r.location.id,
            name: r.location.name,
            timezone: r.location.timezone,
          },
          skill: {
            id: r.skill.id,
            name: r.skill.name,
          },
        },
        requestedBy: requestedByUser || {
          id: r.swapRequest.requestedBy,
          name: 'Unknown',
          email: 'unknown@example.com',
        },
        targetStaff: targetStaffUser || null,
        reviewedBy: reviewedByUser
          ? { id: reviewedByUser.id, name: reviewedByUser.name }
          : null,
        reviewedAt: r.swapRequest.reviewedAt,
        reviewNotes: r.swapRequest.reviewNotes,
      };
    });
  } catch (error) {
    console.error('Error fetching my swap requests:', error);
    return [];
  }
}

/**
 * Cancel a swap/drop request (staff can cancel their own pending requests)
 */
export async function cancelSwapRequest(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    let requestType: 'SWAP' | 'DROP' = 'DROP';
    let targetStaffId: string | null = null;

    try {
      await db.transaction(async (tx) => {
        // Serialize all operations for this swap request
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${requestId}))`);

        const [request] = await tx
          .select()
          .from(swapRequests)
          .where(eq(swapRequests.id, requestId))
          .limit(1);

        if (!request) throw new Error('NOT_FOUND');
        if (request.requestedBy !== user.id) throw new Error('NOT_OWNER');
        if (request.status !== 'PENDING' && request.status !== 'ACCEPTED_BY_TARGET') throw new Error('NOT_PENDING');

        requestType = request.type;
        targetStaffId = request.targetStaffId;

        await tx
          .update(swapRequests)
          .set({
            status: 'CANCELLED',
            updatedAt: new Date(),
          })
          .where(eq(swapRequests.id, requestId));
      });
    } catch (txError: unknown) {
      const msg = txError instanceof Error ? txError.message : '';
      if (msg === 'NOT_FOUND') return { success: false, error: 'Swap request not found' };
      if (msg === 'NOT_OWNER') return { success: false, error: 'You can only cancel your own requests' };
      if (msg === 'NOT_PENDING') return { success: false, error: 'This request has already been processed' };
      throw txError;
    }

    // Notify target staff if it was a swap (outside transaction)
    if ((requestType as string) === 'SWAP' && targetStaffId) {
      const requestingUser = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      await createNotification(
        targetStaffId,
        'SWAP_CANCELLED',
        'Swap Request Cancelled',
        `${requestingUser[0]?.name || 'A staff member'} cancelled their swap request.`,
        'swap_request',
        requestId
      );
    }

    revalidatePath('/swap-requests');
    revalidatePath('/my-shifts');

    return { success: true };
  } catch (error) {
    console.error('Error cancelling swap request:', error);
    return { success: false, error: 'Failed to cancel swap request' };
  }
}

/**
 * Get incoming swap requests where the current user is the target staff
 * (PENDING status = awaiting their acceptance)
 */
export async function getIncomingSwapRequests(): Promise<SwapRequestDetail[]> {
  try {
    const user = await requireAuth();

    const requests = await db
      .select({
        swapRequest: swapRequests,
        shift: shifts,
        location: locations,
        skill: skills,
        assignment: shiftAssignments,
      })
      .from(swapRequests)
      .innerJoin(shiftAssignments, eq(swapRequests.shiftAssignmentId, shiftAssignments.id))
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .innerJoin(locations, eq(shifts.locationId, locations.id))
      .innerJoin(skills, eq(shifts.skillId, skills.id))
      .where(
        and(
          eq(swapRequests.targetStaffId, user.id),
          eq(swapRequests.type, 'SWAP'),
          eq(swapRequests.status, 'PENDING')
        )
      )
      .orderBy(swapRequests.createdAt);

    const userIds = new Set<string>();
    requests.forEach(r => {
      userIds.add(r.swapRequest.requestedBy);
      if (r.swapRequest.targetStaffId) userIds.add(r.swapRequest.targetStaffId);
    });

    const usersData = userIds.size > 0
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, Array.from(userIds)))
      : [];

    const usersMap = new Map(usersData.map(u => [u.id, u]));

    return requests.map(r => {
      const requestedByUser = usersMap.get(r.swapRequest.requestedBy);
      const targetStaffUser = r.swapRequest.targetStaffId
        ? usersMap.get(r.swapRequest.targetStaffId)
        : null;

      return {
        id: r.swapRequest.id,
        type: r.swapRequest.type,
        status: r.swapRequest.status,
        createdAt: r.swapRequest.createdAt,
        updatedAt: r.swapRequest.updatedAt,
        shift: {
          id: r.shift.id,
          date: r.shift.date,
          startTime: r.shift.startTime,
          endTime: r.shift.endTime,
          location: {
            id: r.location.id,
            name: r.location.name,
            timezone: r.location.timezone,
          },
          skill: {
            id: r.skill.id,
            name: r.skill.name,
          },
        },
        requestedBy: requestedByUser || {
          id: r.swapRequest.requestedBy,
          name: 'Unknown',
          email: 'unknown@example.com',
        },
        targetStaff: targetStaffUser || null,
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null,
      };
    });
  } catch (error) {
    console.error('Error fetching incoming swap requests:', error);
    return [];
  }
}

/**
 * Target staff accepts a swap request (step 2 of the swap workflow)
 * Flow: Staff A requests -> Staff B accepts -> Manager approves
 */
export async function acceptSwapAsTarget(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    let requestedBy = '';
    let assignmentShiftId = '';

    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${requestId}))`);

        const [request] = await tx
          .select()
          .from(swapRequests)
          .where(eq(swapRequests.id, requestId))
          .limit(1);

        if (!request) throw new Error('NOT_FOUND');
        if (request.targetStaffId !== user.id) throw new Error('NOT_TARGET');
        if (request.type !== 'SWAP') throw new Error('NOT_SWAP');
        if (request.status !== 'PENDING') throw new Error('NOT_PENDING');

        requestedBy = request.requestedBy;

        const [assignment] = await tx
          .select({ shiftId: shiftAssignments.shiftId })
          .from(shiftAssignments)
          .where(eq(shiftAssignments.id, request.shiftAssignmentId))
          .limit(1);

        assignmentShiftId = assignment?.shiftId || '';

        await tx
          .update(swapRequests)
          .set({
            status: 'ACCEPTED_BY_TARGET',
            updatedAt: new Date(),
          })
          .where(eq(swapRequests.id, requestId));
      });
    } catch (txError: unknown) {
      const msg = txError instanceof Error ? txError.message : '';
      if (msg === 'NOT_FOUND') return { success: false, error: 'Swap request not found' };
      if (msg === 'NOT_TARGET') return { success: false, error: 'You are not the target of this swap request' };
      if (msg === 'NOT_SWAP') return { success: false, error: 'This is not a swap request' };
      if (msg === 'NOT_PENDING') return { success: false, error: 'This request has already been processed' };
      throw txError;
    }

    // Get shift details for notifications
    const [shift] = assignmentShiftId ? await db
      .select({
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        locationId: shifts.locationId,
      })
      .from(shifts)
      .where(eq(shifts.id, assignmentShiftId))
      .limit(1) : [null];

    // Get current user name
    const [currentUser] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    // Notify Staff A that target accepted
    await createNotification(
      requestedBy,
      'SWAP_ACCEPTED',
      'Swap Request Accepted',
      `${currentUser?.name || 'The target staff member'} has accepted your swap request for ${shift?.date} (${shift?.startTime.slice(0, 5)} - ${shift?.endTime.slice(0, 5)}). Awaiting manager approval.`,
      'swap_request',
      requestId
    );

    // Now notify managers that the swap is ready for their review
    if (shift?.locationId) {
      const managers = await db
        .select({ managerId: managerLocations.managerId })
        .from(managerLocations)
        .where(eq(managerLocations.locationId, shift.locationId));

      for (const manager of managers) {
        await createNotification(
          manager.managerId,
          'SWAP_REQUEST',
          'Swap Request Ready for Review',
          `A swap request for ${shift.date} (${shift.startTime.slice(0, 5)} - ${shift.endTime.slice(0, 5)}) has been accepted by both parties and needs your approval.`,
          'swap_request',
          requestId
        );
      }
    }

    revalidatePath('/swap-requests');
    revalidatePath('/my-shifts');

    return { success: true };
  } catch (error) {
    console.error('Error accepting swap request:', error);
    return { success: false, error: 'Failed to accept swap request' };
  }
}

/**
 * Target staff declines a swap request
 */
export async function declineSwapAsTarget(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    let requestedBy = '';
    let assignmentShiftId = '';

    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${requestId}))`);

        const [request] = await tx
          .select()
          .from(swapRequests)
          .where(eq(swapRequests.id, requestId))
          .limit(1);

        if (!request) throw new Error('NOT_FOUND');
        if (request.targetStaffId !== user.id) throw new Error('NOT_TARGET');
        if (request.type !== 'SWAP') throw new Error('NOT_SWAP');
        if (request.status !== 'PENDING') throw new Error('NOT_PENDING');

        requestedBy = request.requestedBy;

        const [assignment] = await tx
          .select({ shiftId: shiftAssignments.shiftId })
          .from(shiftAssignments)
          .where(eq(shiftAssignments.id, request.shiftAssignmentId))
          .limit(1);

        assignmentShiftId = assignment?.shiftId || '';

        await tx
          .update(swapRequests)
          .set({
            status: 'DENIED',
            reviewNotes: 'Declined by target staff',
            updatedAt: new Date(),
          })
          .where(eq(swapRequests.id, requestId));
      });
    } catch (txError: unknown) {
      const msg = txError instanceof Error ? txError.message : '';
      if (msg === 'NOT_FOUND') return { success: false, error: 'Swap request not found' };
      if (msg === 'NOT_TARGET') return { success: false, error: 'You are not the target of this swap request' };
      if (msg === 'NOT_SWAP') return { success: false, error: 'This is not a swap request' };
      if (msg === 'NOT_PENDING') return { success: false, error: 'This request has already been processed' };
      throw txError;
    }

    // Get shift details for notification
    const [shift] = assignmentShiftId ? await db
      .select({
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
      })
      .from(shifts)
      .where(eq(shifts.id, assignmentShiftId))
      .limit(1) : [null];

    // Get current user name
    const [currentUser] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    // Notify Staff A that target declined
    await createNotification(
      requestedBy,
      'SWAP_DECLINED',
      'Swap Request Declined',
      `${currentUser?.name || 'The target staff member'} has declined your swap request for ${shift?.date} (${shift?.startTime.slice(0, 5)} - ${shift?.endTime.slice(0, 5)}).`,
      'swap_request',
      requestId
    );

    revalidatePath('/swap-requests');
    revalidatePath('/my-shifts');

    return { success: true };
  } catch (error) {
    console.error('Error declining swap request:', error);
    return { success: false, error: 'Failed to decline swap request' };
  }
}
