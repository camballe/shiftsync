'use server';

import { db } from '@/db';
import { users, staffLocationCerts, managerLocations, availabilityRules, availabilityExceptions } from '@/db/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { getUser } from '@/lib/auth';
import { createNotifications } from '@/app/notifications/actions';

export interface NotificationPreferences {
  inApp: boolean;
  email: boolean;
}

export interface AvailabilityRule {
  id: string;
  dayOfWeek: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
  startTime: string;
  endTime: string;
}

export interface AvailabilityException {
  id: string;
  date: string;
  isAvailable: boolean;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

/**
 * Get current user's notification preferences
 */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const user = await getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  const [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!dbUser) {
    throw new Error('User not found');
  }

  return (dbUser.notificationPreferences as NotificationPreferences) || {
    inApp: true,
    email: false,
  };
}

/**
 * Update notification preferences
 */
export async function updateNotificationPreferences(
  preferences: NotificationPreferences
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    await db
      .update(users)
      .set({
        notificationPreferences: preferences,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return { success: true };
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return {
      success: false,
      error: 'Failed to update preferences',
    };
  }
}

/**
 * Get current user's desired hours (for staff)
 */
export async function getDesiredHours(): Promise<number | null> {
  const user = await getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  const [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return dbUser?.desiredHours || null;
}

/**
 * Update desired hours
 */
export async function updateDesiredHours(
  desiredHours: number | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    if (user.role !== 'STAFF') {
      return { success: false, error: 'Only staff can set desired hours' };
    }

    await db
      .update(users)
      .set({
        desiredHours,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Notify managers of locations this staff is certified for
    const certs = await db
      .select({ locationId: staffLocationCerts.locationId })
      .from(staffLocationCerts)
      .where(eq(staffLocationCerts.staffId, user.id));

    if (certs.length > 0) {
      const locationIds = certs.map(c => c.locationId);
      const managers = await db
        .select({ managerId: managerLocations.managerId })
        .from(managerLocations)
        .where(inArray(managerLocations.locationId, locationIds));

      const managerIds = [...new Set(managers.map(m => m.managerId))];
      if (managerIds.length > 0) {
        await createNotifications(
          managerIds,
          'AVAILABILITY_CHANGED',
          'Staff Availability Updated',
          `${user.name} has updated their desired weekly hours to ${desiredHours !== null ? desiredHours + ' hours' : 'no preference'}.`,
          'user',
          user.id
        );
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating desired hours:', error);
    return {
      success: false,
      error: 'Failed to update desired hours',
    };
  }
}

/**
 * Get current user's availability rules (recurring weekly patterns)
 */
export async function getAvailabilityRules(): Promise<AvailabilityRule[]> {
  const user = await getUser();
  if (!user) throw new Error('Not authenticated');

  const rules = await db
    .select()
    .from(availabilityRules)
    .where(eq(availabilityRules.staffId, user.id));

  return rules.map(r => ({
    id: r.id,
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime,
    endTime: r.endTime,
  }));
}

/**
 * Get current user's availability exceptions (specific date overrides)
 */
export async function getAvailabilityExceptions(): Promise<AvailabilityException[]> {
  const user = await getUser();
  if (!user) throw new Error('Not authenticated');

  const exceptions = await db
    .select()
    .from(availabilityExceptions)
    .where(eq(availabilityExceptions.staffId, user.id));

  return exceptions.map(e => ({
    id: e.id,
    date: e.date,
    isAvailable: e.isAvailable,
    startTime: e.startTime,
    endTime: e.endTime,
    reason: e.reason,
  }));
}

/**
 * Add or update a recurring availability rule for a day of week
 */
export async function saveAvailabilityRule(
  dayOfWeek: AvailabilityRule['dayOfWeek'],
  startTime: string,
  endTime: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: 'Not authenticated' };
    if (user.role !== 'STAFF') return { success: false, error: 'Only staff can set availability' };

    if (!startTime || !endTime) {
      return { success: false, error: 'Start and end times are required' };
    }

    // Check if rule already exists for this day
    const [existing] = await db
      .select()
      .from(availabilityRules)
      .where(
        and(
          eq(availabilityRules.staffId, user.id),
          eq(availabilityRules.dayOfWeek, dayOfWeek)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(availabilityRules)
        .set({ startTime, endTime })
        .where(eq(availabilityRules.id, existing.id));
    } else {
      await db.insert(availabilityRules).values({
        staffId: user.id,
        dayOfWeek,
        startTime,
        endTime,
      });
    }

    await notifyManagersOfAvailabilityChange(user.id, user.name, `${user.name} updated their ${dayOfWeek} availability to ${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}.`);

    return { success: true };
  } catch (error) {
    console.error('Error saving availability rule:', error);
    return { success: false, error: 'Failed to save availability rule' };
  }
}

/**
 * Delete a recurring availability rule
 */
export async function deleteAvailabilityRule(
  ruleId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    await db
      .delete(availabilityRules)
      .where(and(eq(availabilityRules.id, ruleId), eq(availabilityRules.staffId, user.id)));

    return { success: true };
  } catch (error) {
    console.error('Error deleting availability rule:', error);
    return { success: false, error: 'Failed to delete availability rule' };
  }
}

/**
 * Add an availability exception (specific date override)
 */
export async function saveAvailabilityException(
  date: string,
  isAvailable: boolean,
  startTime: string | null,
  endTime: string | null,
  reason: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: 'Not authenticated' };
    if (user.role !== 'STAFF') return { success: false, error: 'Only staff can set availability' };

    // Check for existing exception on same date
    const [existing] = await db
      .select()
      .from(availabilityExceptions)
      .where(
        and(
          eq(availabilityExceptions.staffId, user.id),
          eq(availabilityExceptions.date, date)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(availabilityExceptions)
        .set({ isAvailable, startTime, endTime, reason })
        .where(eq(availabilityExceptions.id, existing.id));
    } else {
      await db.insert(availabilityExceptions).values({
        staffId: user.id,
        date,
        isAvailable,
        startTime,
        endTime,
        reason,
      });
    }

    const statusText = isAvailable
      ? `available ${startTime?.slice(0, 5) || ''}-${endTime?.slice(0, 5) || ''}`
      : 'unavailable';
    await notifyManagersOfAvailabilityChange(user.id, user.name, `${user.name} set an availability exception for ${date}: ${statusText}${reason ? ` (${reason})` : ''}.`);

    return { success: true };
  } catch (error) {
    console.error('Error saving availability exception:', error);
    return { success: false, error: 'Failed to save availability exception' };
  }
}

/**
 * Delete an availability exception
 */
export async function deleteAvailabilityException(
  exceptionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    await db
      .delete(availabilityExceptions)
      .where(and(eq(availabilityExceptions.id, exceptionId), eq(availabilityExceptions.staffId, user.id)));

    return { success: true };
  } catch (error) {
    console.error('Error deleting availability exception:', error);
    return { success: false, error: 'Failed to delete availability exception' };
  }
}

async function notifyManagersOfAvailabilityChange(staffId: string, staffName: string, message: string) {
  const certs = await db
    .select({ locationId: staffLocationCerts.locationId })
    .from(staffLocationCerts)
    .where(eq(staffLocationCerts.staffId, staffId));

  if (certs.length > 0) {
    const locationIds = certs.map(c => c.locationId);
    const managers = await db
      .select({ managerId: managerLocations.managerId })
      .from(managerLocations)
      .where(inArray(managerLocations.locationId, locationIds));

    const managerIds = [...new Set(managers.map(m => m.managerId))];
    if (managerIds.length > 0) {
      await createNotifications(
        managerIds,
        'AVAILABILITY_CHANGED',
        'Staff Availability Updated',
        message,
        'user',
        staffId
      );
    }
  }
}
