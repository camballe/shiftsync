'use server';

import { db } from '@/db';
import { auditLogs, users, shifts, locations, shiftAssignments } from '@/db/schema';
import { and, gte, lte, eq, inArray } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  changedBy: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  createdAt: Date;
  shift?: {
    date: string;
    startTime: string;
    endTime: string;
    locationName: string;
  };
}

/**
 * Get audit logs for a date range and optional location
 */
export async function getAuditLogs(
  startDate: Date,
  endDate: Date,
  locationId?: string
): Promise<AuditLogEntry[]> {
  await requireRole('ADMIN');

  // Fetch audit logs
  const logs = await db
    .select({
      log: auditLogs,
      user: users,
    })
    .from(auditLogs)
    .innerJoin(users, eq(auditLogs.changedBy, users.id))
    .where(
      and(
        gte(auditLogs.createdAt, startDate),
        lte(auditLogs.createdAt, endDate)
      )
    )
    .orderBy(auditLogs.createdAt);

  // Fetch related shift data if needed
  const entityIds = logs
    .filter((log) => log.log.entityType === 'shift' || log.log.entityType === 'shift_assignment')
    .map((log) => log.log.entityId);

  const uniqueEntityIds = [...new Set(entityIds)];

  // First, try looking up all entity IDs directly as shift IDs
  const shiftData = uniqueEntityIds.length > 0
    ? await db
        .select({
          shift: shifts,
          location: locations,
        })
        .from(shifts)
        .innerJoin(locations, eq(shifts.locationId, locations.id))
        .where(inArray(shifts.id, uniqueEntityIds))
    : [];

  const shiftMap = new Map(
    shiftData.map((s) => [
      s.shift.id,
      {
        date: s.shift.date,
        startTime: s.shift.startTime,
        endTime: s.shift.endTime,
        locationName: s.location.name,
        locationId: s.location.id,
      },
    ])
  );

  // For shift_assignment entries whose entityId didn't match a shift
  // (i.e. the entityId is an assignment UUID), look up via shiftAssignments
  const unresolvedIds = uniqueEntityIds.filter((id) => !shiftMap.has(id));
  if (unresolvedIds.length > 0) {
    const assignmentRows = await db
      .select({
        assignmentId: shiftAssignments.id,
        shiftId: shiftAssignments.shiftId,
      })
      .from(shiftAssignments)
      .where(inArray(shiftAssignments.id, unresolvedIds));

    const resolvedShiftIds = [...new Set(assignmentRows.map((a) => a.shiftId))];

    if (resolvedShiftIds.length > 0) {
      const moreShiftData = await db
        .select({
          shift: shifts,
          location: locations,
        })
        .from(shifts)
        .innerJoin(locations, eq(shifts.locationId, locations.id))
        .where(inArray(shifts.id, resolvedShiftIds));

      // Build a shiftId → data map for the resolved shifts
      const resolvedShiftMap = new Map(
        moreShiftData.map((s) => [
          s.shift.id,
          {
            date: s.shift.date,
            startTime: s.shift.startTime,
            endTime: s.shift.endTime,
            locationName: s.location.name,
            locationId: s.location.id,
          },
        ])
      );

      // Map assignment IDs → shift data
      for (const row of assignmentRows) {
        const data = resolvedShiftMap.get(row.shiftId);
        if (data) {
          shiftMap.set(row.assignmentId, data);
        }
      }
    }
  }

  // For any still-unresolved entity IDs (deleted shifts/assignments), try to
  // reconstruct partial shift data from the audit log metadata itself.
  const stillUnresolved = uniqueEntityIds.filter((id) => !shiftMap.has(id));
  if (stillUnresolved.length > 0) {
    const stillUnresolvedSet = new Set(stillUnresolved);
    for (const log of logs) {
      if (!stillUnresolvedSet.has(log.log.entityId)) continue;
      if (shiftMap.has(log.log.entityId)) continue;

      // Try to extract date/time from the 'after' metadata
      const meta = (log.log.after ?? log.log.before) as Record<string, unknown> | null;
      if (meta && typeof meta.date === 'string') {
        shiftMap.set(log.log.entityId, {
          date: meta.date,
          startTime: typeof meta.startTime === 'string' ? meta.startTime : '',
          endTime: typeof meta.endTime === 'string' ? meta.endTime : '',
          locationName: 'Deleted',
          locationId: '',
        });
      } else {
        // No date in metadata — entity was fully deleted with no recoverable info
        shiftMap.set(log.log.entityId, {
          date: '',
          startTime: '',
          endTime: '',
          locationName: 'Deleted',
          locationId: '',
        });
      }
    }
  }

  // Filter by location if specified
  let filteredLogs = logs;
  if (locationId) {
    filteredLogs = logs.filter((log) => {
      if (log.log.entityType === 'shift' || log.log.entityType === 'shift_assignment') {
        const shift = shiftMap.get(log.log.entityId);
        return shift?.locationId === locationId;
      }
      return true;
    });
  }

  return filteredLogs.map((log) => ({
    id: log.log.id,
    entityType: log.log.entityType,
    entityId: log.log.entityId,
    action: log.log.action,
    before: log.log.before,
    after: log.log.after,
    changedBy: {
      id: log.user.id,
      name: log.user.name,
      email: log.user.email,
      role: log.user.role,
    },
    createdAt: log.log.createdAt,
    shift: shiftMap.get(log.log.entityId),
  }));
}

/**
 * Export audit logs as CSV
 */
export async function exportAuditLogsCSV(
  startDate: Date,
  endDate: Date,
  locationId?: string
): Promise<string> {
  const logs = await getAuditLogs(startDate, endDate, locationId);

  // CSV header
  const header = [
    'Timestamp',
    'Entity Type',
    'Action',
    'Changed By',
    'User Role',
    'Location',
    'Shift Date',
    'Details',
  ].join(',');

  // CSV rows
  const rows = logs.map((log) => {
    const timestamp = log.createdAt.toISOString();
    const entityType = log.entityType;
    const action = log.action;
    const changedBy = log.changedBy.name;
    const userRole = log.changedBy.role;
    const location = log.shift?.locationName || 'N/A';
    const shiftDate = log.shift?.date || 'N/A';

    // Create a simplified details string
    let details = '';
    if (log.before && log.after) {
      details = 'Modified';
    } else if (log.after) {
      details = 'Created';
    } else if (log.before) {
      details = 'Deleted';
    }

    return [
      timestamp,
      entityType,
      action,
      changedBy,
      userRole,
      location,
      shiftDate,
      details,
    ]
      .map((field) => `"${field}"`)
      .join(',');
  });

  return [header, ...rows].join('\n');
}
