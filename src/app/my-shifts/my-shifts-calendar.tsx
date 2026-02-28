'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useRealtimeSubscriptions, type RealtimeEvent } from '@/lib/hooks/useRealtimeSubscription';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateLocal } from '@/lib/date-utils';
import type { MyShift, AvailableShift } from './actions';
import { SwapRequestDialog } from './swap-request-dialog';
import { DropRequestDialog } from './drop-request-dialog';
import { pickUpShift } from './actions';

interface MyShiftsCalendarProps {
  shifts: MyShift[];
  pendingSwapCount: number;
  userId: string;
  availableShifts?: AvailableShift[];
}

export function MyShiftsCalendar({ shifts, pendingSwapCount, userId, availableShifts = [] }: MyShiftsCalendarProps) {
  const router = useRouter();
  const [selectedShift, setSelectedShift] = useState<MyShift | null>(null);
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [dropDialogOpen, setDropDialogOpen] = useState(false);
  const [pickingUp, setPickingUp] = useState<string | null>(null);

  // Memoize callback handlers to prevent infinite re-renders
  const handleAssignmentsChange = useCallback((event: RealtimeEvent) => {
    router.refresh();

    if (event.eventType === 'INSERT') {
      toast.success('New shift assigned', {
        description: 'A new shift has been added to your schedule',
      });
    } else if (event.eventType === 'DELETE') {
      toast.info('Shift removed', {
        description: 'A shift has been removed from your schedule',
      });
    }
  }, [router]);

  const handleShiftsChange = useCallback(() => {
    // Shifts table can't be filtered by staff_id, so we only do a silent
    // refresh to pick up time/publish changes. No toast – the user will
    // see the updated data when the page re-renders.
    router.refresh();
  }, [router]);

  const handleSwapRequestsChange = useCallback((event: RealtimeEvent) => {
    router.refresh();

    if (event.eventType === 'UPDATE') {
      const status = (event.new as Record<string, unknown>).status;
      if (status === 'APPROVED') {
        toast.success('Swap request approved', {
          description: 'Your swap request has been approved by a manager',
        });
      } else if (status === 'DENIED') {
        toast.error('Swap request denied', {
          description: 'Your swap request was not approved',
        });
      }
    }
  }, [router]);

  // Real-time subscriptions for shift changes and swap requests
  // Filtered by userId so only this user's changes trigger callbacks
  const { allConnected } = useRealtimeSubscriptions([
    {
      table: 'shift_assignments',
      filter: `staff_id=eq.${userId}`,
      onChange: handleAssignmentsChange,
    },
    {
      table: 'shifts',
      onChange: handleShiftsChange,
    },
    {
      table: 'swap_requests',
      filter: `requested_by=eq.${userId}`,
      onChange: handleSwapRequestsChange,
    },
  ]);

  // Group shifts by date
  const shiftsByDate = shifts.reduce((acc, shift) => {
    if (!acc[shift.date]) {
      acc[shift.date] = [];
    }
    acc[shift.date].push(shift);
    return acc;
  }, {} as Record<string, MyShift[]>);

  // Sort dates
  const sortedDates = Object.keys(shiftsByDate).sort();

  // Get today's date for comparison
  const today = formatDateLocal(new Date());

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (time: string) => {
    return time.slice(0, 5); // HH:MM
  };

  const isUpcoming = (dateStr: string) => {
    return dateStr >= today;
  };

  const handleSwapRequest = (shift: MyShift) => {
    if (pendingSwapCount >= 3) {
      toast.error('Maximum pending requests', {
        description: 'You already have 3 pending swap/drop requests. Please wait for approval or cancel existing requests.',
      });
      return;
    }

    setSelectedShift(shift);
    setSwapDialogOpen(true);
  };

  const handleDropRequest = (shift: MyShift) => {
    if (pendingSwapCount >= 3) {
      toast.error('Maximum pending requests', {
        description: 'You already have 3 pending swap/drop requests. Please wait for approval or cancel existing requests.',
      });
      return;
    }

    setSelectedShift(shift);
    setDropDialogOpen(true);
  };

  const handlePickUp = async (shiftId: string) => {
    setPickingUp(shiftId);
    try {
      const result = await pickUpShift(shiftId);
      if (result.success) {
        toast.success('Shift picked up', {
          description: 'You have been assigned to this shift',
        });
        router.refresh();
      } else {
        toast.error('Error', {
          description: result.error || 'Failed to pick up shift',
        });
      }
    } catch {
      toast.error('Error', {
        description: 'Failed to pick up shift',
      });
    } finally {
      setPickingUp(null);
    }
  };

  if (shifts.length === 0 && availableShifts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <svg
            className="h-16 w-16 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No shifts assigned</h3>
          <p className="mt-2 text-sm text-gray-500">
            You don&apos;t have any shifts assigned yet. Check back later!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      {!allConnected && (
        <div className="rounded-md bg-yellow-50 p-4">
          <p className="text-sm text-yellow-800">
            Connecting to live updates...
          </p>
        </div>
      )}

      {/* Shifts grouped by date */}
      {sortedDates.map((date) => {
        const dayShifts = shiftsByDate[date];
        const upcoming = isUpcoming(date);

        return (
          <div key={date}>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                {formatDate(date)}
              </h2>
              {!upcoming && (
                <Badge variant="secondary">Past</Badge>
              )}
              {date === today && (
                <Badge className="bg-blue-600">Today</Badge>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {dayShifts.map((shift) => (
                <Card key={shift.id} className={
                  shift.pendingSwapRequest
                    ? 'border-yellow-300 bg-yellow-50'
                    : shift.isPublished
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-gray-200'
                }>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {shift.location.name}
                        </CardDescription>
                      </div>
                      <Badge variant={shift.isPublished ? 'default' : 'secondary'}>
                        {shift.isPublished ? 'Published' : 'Draft'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Skill */}
                    <div className="flex items-center gap-2 text-sm">
                      <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="text-gray-700">{shift.skill.name}</span>
                    </div>

                    {/* Timezone */}
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{shift.location.timezone}</span>
                    </div>

                    {/* Pending Swap Request Status */}
                    {shift.pendingSwapRequest && (
                      <div className="rounded-md bg-yellow-100 px-3 py-2">
                        <p className="text-xs font-medium text-yellow-800">
                          {shift.pendingSwapRequest.type === 'SWAP' ? 'Swap' : 'Drop'} request pending approval
                        </p>
                      </div>
                    )}

                    {/* Actions - only for upcoming published shifts */}
                    {upcoming && shift.isPublished && !shift.pendingSwapRequest && (
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleSwapRequest(shift)}
                        >
                          Request Swap
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleDropRequest(shift)}
                        >
                          Drop Shift
                        </Button>
                      </div>
                    )}

                    {/* Message for unpublished shifts */}
                    {!shift.isPublished && (
                      <p className="text-xs text-gray-500 pt-2">
                        This shift is not yet published by your manager
                      </p>
                    )}

                    {/* Message for past shifts */}
                    {!upcoming && (
                      <p className="text-xs text-gray-500 pt-2">
                        This shift has already occurred
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      {/* Available Shifts to Pick Up */}
      {availableShifts.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Available Shifts</h2>
          <p className="mb-4 text-sm text-gray-600">
            These shifts have open slots and match your qualifications. Pick one up to add it to your schedule.
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {availableShifts.map((shift) => (
              <Card key={shift.id} className="border-green-200 bg-green-50">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {shift.location.name}
                      </CardDescription>
                    </div>
                    <Badge className="bg-green-600">
                      {shift.slotsAvailable} {shift.slotsAvailable === 1 ? 'slot' : 'slots'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-gray-700">{formatDate(shift.date)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="text-gray-700">{shift.skill.name}</span>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={pickingUp === shift.id}
                    onClick={() => handlePickUp(shift.id)}
                  >
                    {pickingUp === shift.id ? 'Picking up...' : 'Pick Up Shift'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Swap Request Dialog */}
      <SwapRequestDialog
        shift={selectedShift}
        isOpen={swapDialogOpen}
        onClose={() => {
          setSwapDialogOpen(false);
          setSelectedShift(null);
        }}
      />

      {/* Drop Request Dialog */}
      <DropRequestDialog
        shift={selectedShift}
        isOpen={dropDialogOpen}
        onClose={() => {
          setDropDialogOpen(false);
          setSelectedShift(null);
        }}
      />
    </div>
  );
}
