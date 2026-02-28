'use server';

import { requireAuth } from '@/lib/auth';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdAt: Date;
}

/**
 * Get all notifications for the current user
 */
export async function getMyNotifications(limit: number = 50): Promise<Notification[]> {
  try {
    const user = await requireAuth();

    const userNotifications = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    return userNotifications;
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return [];
  }
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(
  notificationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    // Verify notification belongs to user
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId))
      .limit(1);

    if (!notification) {
      return { success: false, error: 'Notification not found' };
    }

    if (notification.userId !== user.id) {
      return { success: false, error: 'Unauthorized' };
    }

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, notificationId));

    revalidatePath('/');

    return { success: true };
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return { success: false, error: 'Failed to mark notification as read' };
  }
}

/**
 * Mark all notifications as read for the current user
 */
export async function markAllNotificationsAsRead(): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.userId, user.id),
          eq(notifications.isRead, false)
        )
      );

    revalidatePath('/');

    return { success: true };
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return { success: false, error: 'Failed to mark all notifications as read' };
  }
}

/**
 * Create a notification
 * This is used by other server actions to notify users
 */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  relatedEntityType?: string,
  relatedEntityId?: string
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
  try {
    const [notification] = await db
      .insert(notifications)
      .values({
        userId,
        type,
        title,
        message,
        isRead: false,
        relatedEntityType: relatedEntityType || null,
        relatedEntityId: relatedEntityId || null,
      })
      .returning();

    return { success: true, notificationId: notification.id };
  } catch (error) {
    console.error('Error creating notification:', error);
    return { success: false, error: 'Failed to create notification' };
  }
}

/**
 * Create notifications for multiple users
 * Useful for broadcasting to a group
 */
export async function createNotifications(
  userIds: string[],
  type: string,
  title: string,
  message: string,
  relatedEntityType?: string,
  relatedEntityId?: string
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const notificationValues = userIds.map(userId => ({
      userId,
      type,
      title,
      message,
      isRead: false,
      relatedEntityType: relatedEntityType || null,
      relatedEntityId: relatedEntityId || null,
    }));

    const result = await db
      .insert(notifications)
      .values(notificationValues)
      .returning();

    return { success: true, count: result.length };
  } catch (error) {
    console.error('Error creating notifications:', error);
    return { success: false, error: 'Failed to create notifications' };
  }
}
