'use client';

import { useEffect, useState, useRef, useSyncExternalStore } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

type TableName = 'shifts' | 'shift_assignments' | 'swap_requests' | 'notifications';

export interface RealtimeEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
  table: string;
}

interface UseRealtimeSubscriptionOptions {
  table: TableName;
  filter?: string; // e.g., "location_id=eq.abc-123"
  onInsert?: (payload: Record<string, unknown>) => void;
  onUpdate?: (payload: Record<string, unknown>) => void;
  onDelete?: (payload: Record<string, unknown>) => void;
  onChange?: (event: RealtimeEvent) => void;
}

// ── Browser online/offline tracking ──────────────────────────────
function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}
function getOnlineSnapshot() {
  return navigator.onLine;
}
function getServerSnapshot() {
  return true; // SSR always assumes online
}

function useOnlineStatus() {
  return useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerSnapshot);
}

// ── Single-table subscription ────────────────────────────────────

/**
 * Subscribe to real-time changes on a Supabase table.
 * Callbacks are stored in refs so changing them does not
 * tear down / recreate the underlying Supabase channel.
 */
export function useRealtimeSubscription({
  table,
  filter,
  onInsert,
  onUpdate,
  onDelete,
  onChange,
}: UseRealtimeSubscriptionOptions) {
  const [channelConnected, setChannelConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isOnline = useOnlineStatus();

  // Keep the latest callbacks in refs so the subscription
  // closure always invokes the most recent version.
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onInsertRef.current = onInsert;
    onUpdateRef.current = onUpdate;
    onDeleteRef.current = onDelete;
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const supabase = createClient();

    const channelName = filter
      ? `${table}:${filter}`
      : `${table}:all`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as const,
        {
          event: '*',
          schema: 'public',
          table,
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          try {
            const event: RealtimeEvent = {
              eventType: payload.eventType as RealtimeEvent['eventType'],
              new: (payload.new ?? {}) as Record<string, unknown>,
              old: (payload.old ?? {}) as Record<string, unknown>,
              table: payload.table,
            };

            if (payload.eventType === 'INSERT' && onInsertRef.current) {
              onInsertRef.current(payload.new as Record<string, unknown>);
            } else if (payload.eventType === 'UPDATE' && onUpdateRef.current) {
              onUpdateRef.current(payload.new as Record<string, unknown>);
            } else if (payload.eventType === 'DELETE' && onDeleteRef.current) {
              onDeleteRef.current((payload.old ?? {}) as Record<string, unknown>);
            }

            if (onChangeRef.current) {
              onChangeRef.current(event);
            }
          } catch (err) {
            setError(err as Error);
            console.error('Realtime event handler error:', err);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setChannelConnected(true);
          setError(null);
        } else if (status === 'CLOSED') {
          setChannelConnected(false);
        } else if (status === 'CHANNEL_ERROR') {
          setError(new Error('Realtime channel error'));
          setChannelConnected(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
      setChannelConnected(false);
    };
  }, [table, filter]); // Only re-subscribe when table or filter changes

  // Connected = channel subscribed AND browser is online
  const isConnected = channelConnected && isOnline;

  return { isConnected, error };
}

// ── Multi-table subscription ─────────────────────────────────────

/**
 * Subscribe to multiple tables at once.
 * All subscriptions are managed in a single useEffect so we
 * never call hooks inside a loop (which violates React rules).
 */
export function useRealtimeSubscriptions(
  subscriptions: UseRealtimeSubscriptionOptions[]
) {
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, Error | null>>({});
  const isOnline = useOnlineStatus();

  // Keep the latest subscription configs in a ref so the
  // channel callbacks always use up-to-date handlers.
  const subsRef = useRef(subscriptions);
  subsRef.current = subscriptions;

  // Stable identity key — only re-subscribe when the set of
  // subscribed tables / filters changes.
  const key = subscriptions
    .map((s) => `${s.table}:${s.filter || '*'}`)
    .join('|');

  useEffect(() => {
    const supabase = createClient();
    const channels: RealtimeChannel[] = [];

    subsRef.current.forEach((sub, index) => {
      const channelName = `multi-${index}-${sub.table}:${sub.filter || 'all'}`;

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes' as const,
          {
            event: '*',
            schema: 'public',
            table: sub.table,
            ...(sub.filter ? { filter: sub.filter } : {}),
          },
          (payload) => {
            try {
              const currentSub = subsRef.current[index];
              if (!currentSub) return;

              const event: RealtimeEvent = {
                eventType: payload.eventType as RealtimeEvent['eventType'],
                new: (payload.new ?? {}) as Record<string, unknown>,
                old: (payload.old ?? {}) as Record<string, unknown>,
                table: payload.table,
              };

              if (payload.eventType === 'INSERT' && currentSub.onInsert) {
                currentSub.onInsert(payload.new as Record<string, unknown>);
              } else if (payload.eventType === 'UPDATE' && currentSub.onUpdate) {
                currentSub.onUpdate(payload.new as Record<string, unknown>);
              } else if (payload.eventType === 'DELETE' && currentSub.onDelete) {
                currentSub.onDelete((payload.old ?? {}) as Record<string, unknown>);
              }

              if (currentSub.onChange) {
                currentSub.onChange(event);
              }
            } catch (err) {
              console.error('Realtime event handler error:', err);
              setErrors((prev) => ({ ...prev, [sub.table]: err as Error }));
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setStatuses((prev) => ({ ...prev, [sub.table]: true }));
            setErrors((prev) => ({ ...prev, [sub.table]: null }));
          } else if (status === 'CLOSED') {
            setStatuses((prev) => ({ ...prev, [sub.table]: false }));
          } else if (status === 'CHANNEL_ERROR') {
            setStatuses((prev) => ({ ...prev, [sub.table]: false }));
            setErrors((prev) => ({
              ...prev,
              [sub.table]: new Error(`Realtime channel error for ${sub.table}`),
            }));
          }
        });

      channels.push(channel);
    });

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
      setStatuses({});
    };
  }, [key]);

  // Connected = all channels subscribed AND browser is online
  const allConnected =
    isOnline &&
    subscriptions.length > 0 &&
    subscriptions.every((s) => statuses[s.table]);

  const anyError = Object.values(errors).find((e) => e !== null) || null;

  return { allConnected, anyError };
}
