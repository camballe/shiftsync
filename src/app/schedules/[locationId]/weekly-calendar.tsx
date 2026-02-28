'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useRealtimeSubscriptions, type RealtimeEvent } from '@/lib/hooks/useRealtimeSubscription';
import { ShiftFormModal } from './shift-form-modal';
import { ShiftAssignmentDialog } from './shift-assignment-dialog';
import { deleteShift, publishShift, unpublishShift } from './actions';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDateLocal } from '@/lib/date-utils';

interface Location {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
}

interface Skill {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string;
  email: string;
}

interface Assignment {
  assignment: {
    id: string;
    shiftId: string;
    staffId: string;
    createdAt: Date;
  };
  staff: User;
}

interface Shift {
  id: string;
  locationId: string;
  date: string;
  startTime: string;
  endTime: string;
  skillId: string;
  headcount: number;
  isPublished: boolean;
  publishedAt: Date | null;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  skill: Skill | null;
  assignments: Assignment[];
}

interface WeeklyCalendarProps {
  locations: Location[];
  selectedLocation: Location;
  weekStart: Date;
  shifts: Shift[];
  timezone: string;
}

export function WeeklyCalendar({
  locations,
  selectedLocation,
  weekStart,
  shifts,
  timezone,
}: WeeklyCalendarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [isAssignmentDialogOpen, setIsAssignmentDialogOpen] = useState(false);
  const [assignmentShiftId, setAssignmentShiftId] = useState<string | null>(null);
  const [deleteShiftId, setDeleteShiftId] = useState<string | null>(null);

  // Memoize callback handlers to prevent infinite re-renders
  const handleShiftsChange = useCallback((event: RealtimeEvent) => {
    // Refresh the page data when shifts change
    router.refresh();

    // Show notification
    if (event.eventType === 'INSERT') {
      toast.info('New shift created', {
        description: 'The schedule has been updated',
      });
    } else if (event.eventType === 'UPDATE') {
      toast.info('Shift updated', {
        description: 'Changes have been made to the schedule',
      });
    } else if (event.eventType === 'DELETE') {
      toast.warning('Shift deleted', {
        description: 'A shift has been removed from the schedule',
      });
    }
  }, [router]);

  const handleAssignmentsChange = useCallback((event: RealtimeEvent) => {
    // Refresh when assignments change
    router.refresh();

    if (event.eventType === 'INSERT') {
      toast.success('Staff assigned', {
        description: 'A staff member has been assigned to a shift',
      });
    } else if (event.eventType === 'DELETE') {
      toast.info('Assignment removed', {
        description: 'A staff member has been unassigned from a shift',
      });
    }
  }, [router]);

  // Real-time subscriptions for this location
  useRealtimeSubscriptions([
    {
      table: 'shifts',
      filter: `location_id=eq.${selectedLocation.id}`,
      onChange: handleShiftsChange,
    },
    {
      table: 'shift_assignments',
      onChange: handleAssignmentsChange,
    },
  ]);

  // Generate 7 days for the week (Monday-Sunday)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    return day;
  });

  // Format date for display
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  // Format date for URL parameter (YYYY-MM-DD)
  // Use local date parts to avoid timezone conversion issues
  const formatDateParam = formatDateLocal;

  // Get shifts for a specific day
  const getShiftsForDay = (date: Date) => {
    const dateStr = formatDateParam(date);
    return shifts.filter(shift => shift.date === dateStr)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  // Navigate to previous week
  const handlePreviousWeek = () => {
    const prevWeek = new Date(weekStart);
    prevWeek.setDate(prevWeek.getDate() - 7);
    router.push(`/schedules/${selectedLocation.id}?week=${formatDateParam(prevWeek)}`);
  };

  // Navigate to next week
  const handleNextWeek = () => {
    const nextWeek = new Date(weekStart);
    nextWeek.setDate(nextWeek.getDate() + 7);
    router.push(`/schedules/${selectedLocation.id}?week=${formatDateParam(nextWeek)}`);
  };

  // Handle location change
  const handleLocationChange = (locationId: string) => {
    const week = searchParams.get('week');
    const url = week
      ? `/schedules/${locationId}?week=${week}`
      : `/schedules/${locationId}`;
    router.push(url);
  };

  // Get week range for display
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekRange = `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;

  // Open create shift modal
  const handleCreateShift = () => {
    setSelectedShift(null);
    setIsModalOpen(true);
  };

  // Open edit shift modal
  const handleEditShift = (shift: Shift) => {
    setSelectedShift(shift);
    setIsModalOpen(true);
  };

  // Close modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedShift(null);
  };

  // Handle shift deletion
  const handleDeleteShift = (shiftId: string) => {
    setDeleteShiftId(shiftId);
  };

  const confirmDeleteShift = async () => {
    if (!deleteShiftId) return;

    const result = await deleteShift(deleteShiftId, selectedLocation.id);
    if (!result.success) {
      toast.error(result.error || 'Failed to delete shift');
    }
    setDeleteShiftId(null);
  };

  // Handle shift publish
  const handlePublishShift = async (shiftId: string) => {
    const result = await publishShift(shiftId, selectedLocation.id);
    if (!result.success) {
      toast.error(result.error || 'Failed to publish shift');
    }
  };

  // Handle shift unpublish
  const handleUnpublishShift = async (shiftId: string) => {
    const result = await unpublishShift(shiftId, selectedLocation.id);
    if (!result.success) {
      toast.error(result.error || 'Failed to unpublish shift');
    }
  };

  // Open assignment dialog
  const handleOpenAssignments = (shiftId: string) => {
    setAssignmentShiftId(shiftId);
    setIsAssignmentDialogOpen(true);
  };

  // Close assignment dialog
  const handleCloseAssignments = () => {
    setIsAssignmentDialogOpen(false);
    setAssignmentShiftId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          {/* Location Selector */}
          {locations.length > 1 && (
            <Select value={selectedLocation.id} onValueChange={handleLocationChange}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Week Navigation */}
          <div className="flex items-center gap-2">
            <Button onClick={handlePreviousWeek} variant="outline" size="sm">
              ←
            </Button>
            <span className="flex-1 text-center text-sm font-medium text-gray-900 sm:px-4">
              {weekRange}
            </span>
            <Button onClick={handleNextWeek} variant="outline" size="sm">
              →
            </Button>
          </div>
        </div>

        {/* Create Shift Button */}
        <Button onClick={handleCreateShift} className="w-full sm:w-auto">
          + Create Shift
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow -mx-4 sm:mx-0">
        <div className="min-w-[700px]">
        <div className="grid grid-cols-7 divide-x divide-gray-200 border-b border-gray-200 bg-gray-50">
          {weekDays.map((day) => (
            <div
              key={day.toISOString()}
              className="px-2 py-2 sm:px-4 sm:py-3 text-center"
            >
              <div className="text-xs sm:text-sm font-semibold text-gray-900">
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div className="text-xs text-gray-600">
                {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 divide-x divide-gray-200">
          {weekDays.map((day) => {
            const dayShifts = getShiftsForDay(day);
            return (
              <div
                key={day.toISOString()}
                className="min-h-[300px] sm:min-h-[400px] bg-white p-1.5 sm:p-2"
              >
                <div className="space-y-2">
                  {dayShifts.length === 0 ? (
                    <div className="flex h-32 items-center justify-center text-xs text-gray-400">
                      No shifts
                    </div>
                  ) : (
                    dayShifts.map((shift) => {
                      const assignedCount = shift.assignments.length;
                      const isFullyStaffed = assignedCount >= shift.headcount;
                      const isPartiallyStaffed = assignedCount > 0 && assignedCount < shift.headcount;

                      return (
                        <div
                          key={shift.id}
                          onClick={() => handleOpenAssignments(shift.id)}
                          className={`relative rounded-md border p-2 text-xs hover:shadow-md transition-shadow cursor-pointer ${
                            shift.isPublished
                              ? 'border-blue-200 bg-blue-50'
                              : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          {/* Dropdown Menu */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="absolute top-1 right-1 h-6 w-6 p-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                </svg>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleEditShift(shift);
                              }}>
                                Edit
                              </DropdownMenuItem>
                              {!shift.isPublished ? (
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  handlePublishShift(shift.id);
                                }}>
                                  Publish
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  handleUnpublishShift(shift.id);
                                }}>
                                  Unpublish
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteShift(shift.id);
                                }}
                                className="text-red-600"
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          {/* Time */}
                          <div className="font-semibold text-gray-900 pr-6">
                            {shift.startTime.slice(0, 5)} - {shift.endTime.slice(0, 5)}
                          </div>

                          {/* Skill */}
                          <div className="mt-1 text-gray-700">
                            {shift.skill?.name || 'Unknown Skill'}
                          </div>

                          {/* Staffing Status */}
                          <div className="mt-2 flex items-center justify-between">
                            <span
                              className={`font-medium ${
                                isFullyStaffed
                                  ? 'text-green-700'
                                  : isPartiallyStaffed
                                  ? 'text-yellow-700'
                                  : 'text-red-700'
                              }`}
                            >
                              {assignedCount}/{shift.headcount}
                            </span>

                            {/* Published Indicator */}
                            {shift.isPublished ? (
                              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                                Published
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                Draft
                              </span>
                            )}
                          </div>

                          {/* Assigned Staff Names */}
                          {shift.assignments.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {shift.assignments.map((assignment) => (
                                <div
                                  key={assignment.assignment.id}
                                  className="truncate text-xs text-gray-600"
                                >
                                  • {assignment.staff.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* Timezone Indicator */}
      <div className="text-xs text-gray-500">
        All times shown in {timezone}
      </div>

      {/* Shift Form Modal */}
      <ShiftFormModal
        locationId={selectedLocation.id}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        shift={selectedShift ? {
          id: selectedShift.id,
          date: selectedShift.date,
          startTime: selectedShift.startTime,
          endTime: selectedShift.endTime,
          skillId: selectedShift.skillId,
          headcount: selectedShift.headcount,
          version: selectedShift.version,
        } : null}
      />

      {/* Shift Assignment Dialog */}
      <ShiftAssignmentDialog
        shiftId={assignmentShiftId}
        locationId={selectedLocation.id}
        isOpen={isAssignmentDialogOpen}
        onClose={handleCloseAssignments}
      />

      {/* Delete Shift Confirmation */}
      <AlertDialog open={!!deleteShiftId} onOpenChange={(open) => { if (!open) setDeleteShiftId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete shift</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this shift? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteShift} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
