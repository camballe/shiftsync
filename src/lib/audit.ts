import { db } from '@/db';
import { auditLogs } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export type AuditAction =
  | 'shift_created'
  | 'shift_updated'
  | 'shift_deleted'
  | 'shift_published'
  | 'shift_unpublished'
  | 'assignment_created'
  | 'assignment_deleted'
  | 'shift_assignment_updated'
  | 'shift_assignment_removed'
  | 'swap_requested'
  | 'swap_approved'
  | 'swap_denied'
  | 'swap_cancelled';

export type AuditMetadata = Record<string, unknown>;

/**
 * Create an audit log entry
 */
export async function createAuditLog(
  action: AuditAction,
  userId: string,
  entityId: string,
  metadata?: AuditMetadata
): Promise<void> {
  // Map the action to entity type
  let entityType = 'shift';
  if (action.includes('assignment')) {
    entityType = 'shift_assignment';
  } else if (action.includes('swap')) {
    entityType = 'swap_request';
  }

  await db.insert(auditLogs).values({
    entityType,
    entityId,
    action,
    before: null,
    after: metadata ? metadata : null,
    changedBy: userId,
  });
}

/**
 * Get audit logs for a specific shift
 */
export async function getShiftAuditLogs(shiftId: string) {
  const logs = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.entityId, shiftId),
        eq(auditLogs.entityType, 'shift')
      )
    )
    .orderBy(desc(auditLogs.createdAt));

  return logs;
}

/**
 * Format audit log action for display
 */
export function formatAuditAction(action: AuditAction): string {
  const actionMap: Record<AuditAction, string> = {
    shift_created: 'Shift created',
    shift_updated: 'Shift updated',
    shift_deleted: 'Shift deleted',
    shift_published: 'Shift published',
    shift_unpublished: 'Shift unpublished',
    assignment_created: 'Staff assigned',
    assignment_deleted: 'Staff unassigned',
    shift_assignment_updated: 'Shift assignment updated',
    shift_assignment_removed: 'Shift assignment removed',
    swap_requested: 'Swap requested',
    swap_approved: 'Swap approved',
    swap_denied: 'Swap denied',
    swap_cancelled: 'Swap cancelled',
  };

  return actionMap[action] || action;
}

/**
 * Format audit log metadata for display
 */
export function formatAuditMetadata(metadata: AuditMetadata): string {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return '';

  return entries
    .map(([key, value]) => {
      const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return `${formattedKey}: ${JSON.stringify(value)}`;
    })
    .join(', ');
}
