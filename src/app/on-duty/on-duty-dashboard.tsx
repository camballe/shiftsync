'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { OnDutyStaff } from './actions';
import { useRealtimeSubscription } from '@/lib/hooks/useRealtimeSubscription';

interface OnDutyDashboardProps {
  onDutyStaff: OnDutyStaff[];
}

export function OnDutyDashboard({
  onDutyStaff: initialOnDutyStaff,
}: OnDutyDashboardProps) {
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Memoize callback handlers to prevent infinite re-renders
  const handleRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  // Subscribe to real-time updates for shifts and assignments
  useRealtimeSubscription({
    table: 'shifts',
    onChange: handleRefresh,
  });

  useRealtimeSubscription({
    table: 'shift_assignments',
    onChange: handleRefresh,
  });

  // Update clock every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      // Refresh data every minute to catch shifts that start/end
      router.refresh();
    }, 60000);

    return () => clearInterval(interval);
  }, [router]);

  // Group staff by location
  const staffByLocation = initialOnDutyStaff.reduce((acc, staff) => {
    if (!acc[staff.locationId]) {
      acc[staff.locationId] = {
        locationName: staff.locationName,
        locationTimezone: staff.locationTimezone,
        staff: [],
      };
    }
    acc[staff.locationId].staff.push(staff);
    return acc;
  }, {} as Record<string, { locationName: string; locationTimezone: string; staff: OnDutyStaff[] }>);

  const locations = Object.keys(staffByLocation);

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatCurrentTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">On-Duty Now</h1>
          <p className="mt-1 text-sm text-gray-600">
            Real-time view of staff currently working
          </p>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-sm text-gray-600">Current Time</div>
          <div className="text-lg font-semibold text-gray-900">
            {formatCurrentTime(currentTime)}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        <Card className="p-4 sm:p-6">
          <div className="text-sm font-medium text-gray-600">Total On-Duty</div>
          <div className="mt-2 text-2xl sm:text-3xl font-semibold text-gray-900">
            {initialOnDutyStaff.length}
          </div>
        </Card>

        <Card className="p-4 sm:p-6">
          <div className="text-sm font-medium text-gray-600">Active Locations</div>
          <div className="mt-2 text-2xl sm:text-3xl font-semibold text-gray-900">
            {locations.length}
          </div>
        </Card>

        <Card className="p-4 sm:p-6">
          <div className="text-sm font-medium text-gray-600">Avg per Location</div>
          <div className="mt-2 text-2xl sm:text-3xl font-semibold text-gray-900">
            {locations.length > 0
              ? (initialOnDutyStaff.length / locations.length).toFixed(1)
              : '0'}
          </div>
        </Card>

        <Card className="p-4 sm:p-6">
          <div className="text-sm font-medium text-gray-600">Auto-Refresh</div>
          <div className="mt-2 flex items-center">
            <div className="h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse"></div>
            <span className="text-sm text-gray-900">Every minute</span>
          </div>
        </Card>
      </div>

      {/* By Location */}
      {locations.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <div className="text-4xl mb-4">🌙</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No Staff Currently On-Duty
            </h3>
            <p className="text-sm text-gray-600">
              There are no active shifts at this time. Staff will appear here when their shifts begin.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {locations.map((locationId) => {
            const locationData = staffByLocation[locationId];
            return (
              <Card key={locationId} className="p-4 sm:p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {locationData.locationName}
                    </h2>
                    <p className="text-sm text-gray-600">
                      {locationData.locationTimezone}
                    </p>
                  </div>
                  <Badge variant="default" className="text-base sm:text-lg px-3 py-1 sm:px-4 sm:py-2 w-fit">
                    {locationData.staff.length} on duty
                  </Badge>
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Staff Member
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Role
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Shift Time
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {locationData.staff.map((staff) => (
                        <tr key={staff.staffId + staff.shiftId} className="hover:bg-gray-50">
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {staff.staffName}
                            </div>
                            <div className="text-sm text-gray-500 truncate">
                              {staff.staffEmail}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <Badge variant="outline">{staff.skillName}</Badge>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatTime(staff.shiftStart)} - {formatTime(staff.shiftEnd)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1.5"></span>
                              Active
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile card list */}
                <div className="sm:hidden space-y-3">
                  {locationData.staff.map((staff) => (
                    <div key={staff.staffId + staff.shiftId} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900">{staff.staffName}</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <Badge variant="outline" className="text-xs">{staff.skillName}</Badge>
                        <span>{formatTime(staff.shiftStart)} - {formatTime(staff.shiftEnd)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Info Footer */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-blue-400"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm text-blue-700">
              This dashboard automatically refreshes every minute and updates in real-time when shifts or assignments change.
              Only published shifts for today are shown.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
