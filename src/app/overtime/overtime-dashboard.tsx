'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { WeeklyOvertimeReport } from './actions';
import { formatDateLocal } from '@/lib/date-utils';

interface Location {
  id: string;
  name: string;
  timezone: string;
}

interface OvertimeDashboardProps {
  locations: Location[];
  selectedLocation: Location;
  weekStart: Date;
  overtimeReport: WeeklyOvertimeReport;
}

export function OvertimeDashboard({
  locations,
  selectedLocation,
  weekStart,
  overtimeReport,
}: OvertimeDashboardProps) {
  const router = useRouter();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateParam = (date: Date) => {
    return formatDateLocal(date);
  };

  const handlePreviousWeek = () => {
    const prevWeek = new Date(weekStart);
    prevWeek.setDate(prevWeek.getDate() - 7);
    router.push(
      `/overtime?location=${selectedLocation.id}&week=${formatDateParam(prevWeek)}`
    );
  };

  const handleNextWeek = () => {
    const nextWeek = new Date(weekStart);
    nextWeek.setDate(nextWeek.getDate() + 7);
    router.push(
      `/overtime?location=${selectedLocation.id}&week=${formatDateParam(nextWeek)}`
    );
  };

  const handleLocationChange = (locationId: string) => {
    router.push(
      `/overtime?location=${locationId}&week=${formatDateParam(weekStart)}`
    );
  };

  const staffWithOvertime = overtimeReport.staffData.filter(
    (s) => s.overtimeHours > 0
  );

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          {/* Location Selector */}
          {locations.length > 1 && (
            <Select
              value={selectedLocation.id}
              onValueChange={handleLocationChange}
            >
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
              {formatDate(overtimeReport.weekStart)} -{' '}
              {formatDate(overtimeReport.weekEnd)}
            </span>
            <Button onClick={handleNextWeek} variant="outline" size="sm">
              →
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Regular Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {overtimeReport.totalRegularHours.toFixed(1)}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              @ $15/hour = ${(overtimeReport.totalRegularHours * 15).toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Overtime Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                overtimeReport.totalOvertimeHours > 0
                  ? 'text-yellow-600'
                  : 'text-gray-900'
              }`}
            >
              {overtimeReport.totalOvertimeHours.toFixed(1)}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              @ $22.50/hour = $
              {(overtimeReport.totalOvertimeHours * 22.5).toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Projected Total Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${overtimeReport.totalProjectedCost.toFixed(2)}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {staffWithOvertime.length} staff with overtime
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Staff Breakdown */}
      {overtimeReport.staffData.length === 0 ? (
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
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              No shifts scheduled
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              There are no assigned shifts for this week
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Staff Hours Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {overtimeReport.staffData.map((staff) => (
                <div
                  key={staff.staffId}
                  className={`rounded-lg border p-4 ${
                    staff.overtimeHours > 0
                      ? 'border-yellow-200 bg-yellow-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-gray-900">
                          {staff.staffName}
                        </h3>
                        {staff.overtimeHours > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            OVERTIME
                          </Badge>
                        )}
                      </div>

                      {/* Hours Summary */}
                      <div className="mt-2 flex flex-wrap items-center gap-3 sm:gap-6 text-sm">
                        <div>
                          <span className="text-gray-600">Regular:</span>{' '}
                          <span className="font-medium text-gray-900">
                            {staff.regularHours.toFixed(1)}h
                          </span>
                        </div>
                        {staff.overtimeHours > 0 && (
                          <div>
                            <span className="text-gray-600">Overtime:</span>{' '}
                            <span className="font-medium text-yellow-700">
                              {staff.overtimeHours.toFixed(1)}h
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-600">Total:</span>{' '}
                          <span className="font-medium text-gray-900">
                            {staff.totalHours.toFixed(1)}h
                          </span>
                        </div>
                      </div>

                      {/* Projected Cost */}
                      <div className="mt-2 text-sm">
                        <span className="text-gray-600">Projected cost:</span>{' '}
                        <span className="font-semibold text-green-600">
                          ${staff.projectedOvertimeCost.toFixed(2)}
                        </span>
                      </div>

                      {/* Shift List */}
                      <div className="mt-3 space-y-1">
                        {staff.shifts.map((shift) => (
                          <div
                            key={shift.id}
                            className="text-xs text-gray-600"
                          >
                            {formatDate(shift.date)} •{' '}
                            {shift.startTime.slice(0, 5)} -{' '}
                            {shift.endTime.slice(0, 5)} •{' '}
                            {shift.hours.toFixed(1)}h
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full sm:ml-4 sm:w-48 shrink-0">
                      <div className="text-xs text-gray-600 mb-1">
                        {staff.totalHours.toFixed(1)} / 40 hours
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-200">
                        <div
                          className={`h-2 rounded-full ${
                            staff.totalHours > 40
                              ? 'bg-yellow-500'
                              : staff.totalHours >= 35
                              ? 'bg-orange-400'
                              : 'bg-green-500'
                          }`}
                          style={{
                            width: `${Math.min((staff.totalHours / 50) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {staff.totalHours >= 40
                          ? 'In overtime'
                          : staff.totalHours >= 35
                          ? 'Approaching overtime'
                          : 'Within limits'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <div className="text-xs text-gray-500">
        <p>
          Overtime rates: Regular $15/hour, Overtime (40+ hours) $22.50/hour
          (1.5x)
        </p>
        <p className="mt-1">
          These are projected costs based on current assignments. Actual costs
          may vary.
        </p>
      </div>
    </div>
  );
}
