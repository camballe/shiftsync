'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRealtimeSubscription } from '@/lib/hooks/useRealtimeSubscription';
import { markNotificationAsRead, markAllNotificationsAsRead, type Notification } from '@/app/notifications/actions';

interface NotificationCenterProps {
  userId: string | null;
  initialNotifications: Notification[];
}

export function NotificationCenter({ userId, initialNotifications }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Update when initial notifications change
  useEffect(() => {
    setNotifications(initialNotifications);
  }, [initialNotifications]);

  // Memoize callback handlers to prevent infinite re-renders
  const handleInsert = useCallback((payload: Record<string, unknown>) => {
    const newNotification = payload as unknown as Notification;
    setNotifications(prev => [newNotification, ...prev]);
  }, []);

  const handleUpdate = useCallback((payload: Record<string, unknown>) => {
    const updated = payload as unknown as Notification;
    setNotifications(prev =>
      prev.map(n => (n.id === updated.id ? updated : n))
    );
  }, []);

  // Real-time subscription for new notifications
  useRealtimeSubscription({
    table: 'notifications',
    filter: userId ? `user_id=eq.${userId}` : undefined,
    onInsert: handleInsert,
    onUpdate: handleUpdate,
  });

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const handleMarkAsRead = async (notificationId: string) => {
    // Optimistically update UI
    setNotifications(prev =>
      prev.map(n => (n.id === notificationId ? { ...n, isRead: true } : n))
    );

    const result = await markNotificationAsRead(notificationId);
    if (!result.success) {
      // Revert on error
      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, isRead: false } : n))
      );
      toast.error('Failed to mark notification as read');
    }
  };

  const handleMarkAllAsRead = async () => {
    const unread = notifications.filter(n => !n.isRead);

    // Optimistically update UI
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));

    const result = await markAllNotificationsAsRead();
    if (!result.success) {
      // Revert on error
      setNotifications(prev =>
        prev.map(n => {
          const wasUnread = unread.find(u => u.id === n.id);
          return wasUnread ? { ...n, isRead: false } : n;
        })
      );
      toast.error('Failed to mark all as read');
    }
  };

  if (!userId) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-3 py-2">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs text-blue-600"
              onClick={handleMarkAllAsRead}
            >
              Mark all as read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <p className="mt-2">No notifications yet</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            {notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`flex flex-col items-start gap-1 p-3 ${
                  !notification.isRead ? 'bg-blue-50' : ''
                }`}
                onClick={() => handleMarkAsRead(notification.id)}
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <p className="font-medium text-sm">{notification.title}</p>
                  {!notification.isRead && (
                    <div className="h-2 w-2 rounded-full bg-blue-600 flex-shrink-0 mt-1" />
                  )}
                </div>
                <p className="text-xs text-gray-600">{notification.message}</p>
                <p className="text-xs text-gray-400">
                  {formatTime(notification.createdAt)}
                </p>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
