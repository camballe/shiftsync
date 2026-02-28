'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { FairnessReport } from './actions';
import { formatDateLocal } from '@/lib/date-utils';

interface FairnessDashboardProps {
  locations: Array<{ id: string; name: string }>;
  selectedLocation: { id: string; name: string };
  startDate: Date;
  endDate: Date;
  fairnessReport: FairnessReport;
}

export function FairnessDashboard({
  locations,
  selectedLocation,
  startDate,
  endDate,
  fairnessReport,
}: FairnessDashboardProps) {
  const router = useRouter();
  const [selectedLocationId, setSelectedLocationId] = useState(selectedLocation.id);
  const [localStartDate, setLocalStartDate] = useState(
    formatDateLocal(startDate)
  );
  const [localEndDate, setLocalEndDate] = useState(
    formatDateLocal(endDate)
  );

  const handleLocationChange = (locationId: string) => {
    setSelectedLocationId(locationId);
    router.push(
      `/fairness?location=${locationId}&startDate=${localStartDate}&endDate=${localEndDate}`
    );
  };

  const handleDateChange = () => {
    router.push(
      `/fairness?location=${selectedLocationId}&startDate=${localStartDate}&endDate=${localEndDate}`
    );
  };

  const handleQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    setLocalStartDate(formatDateLocal(start));
    setLocalEndDate(formatDateLocal(end));
    router.push(
      `/fairness?location=${selectedLocationId}&startDate=${formatDateLocal(start)}&endDate=${formatDateLocal(end)}`
    );
  };

  // Calculate fairness score color
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      over: 'bg-red-100 text-red-800',
      under: 'bg-blue-100 text-blue-800',
      balanced: 'bg-green-100 text-green-800',
      no_preference: 'bg-gray-100 text-gray-800',
    };
    const labels = {
      over: 'Over-scheduled',
      under: 'Under-scheduled',
      balanced: 'Balanced',
      no_preference: 'No preference set',
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Schedule Fairness Analytics</h1>
        <p className="mt-1 text-sm text-gray-600">
          Analyze shift distribution and ensure equitable scheduling
        </p>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full sm:flex-1 sm:min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <Select value={selectedLocationId} onValueChange={handleLocationChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:flex-1 sm:min-w-[130px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={localStartDate}
              onChange={(e) => setLocalStartDate(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div className="w-full sm:flex-1 sm:min-w-[130px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={localEndDate}
              onChange={(e) => setLocalEndDate(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <Button onClick={handleDateChange} className="w-full sm:w-auto">Apply</Button>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={() => handleQuickRange(7)}>
            Last 7 days
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickRange(30)}>
            Last 30 days
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickRange(90)}>
            Last 90 days
          </Button>
        </div>
      </Card>

      {/* Fairness Score */}
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Fairness Score</h2>
            <p className="text-sm text-gray-600 mt-1">
              Overall fairness of shift distribution (0-100)
            </p>
          </div>
          <div className={`text-3xl sm:text-4xl font-bold rounded-lg px-4 py-3 sm:px-6 sm:py-4 text-center ${getScoreColor(fairnessReport.fairnessScore)}`}>
            {fairnessReport.fairnessScore}
          </div>
        </div>
      </Card>

      {/* Insights */}
      {fairnessReport.insights.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Insights</h2>
          <ul className="space-y-2">
            {fairnessReport.insights.map((insight, index) => (
              <li key={index} className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <span className="text-sm text-gray-700">{insight}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card className="p-6">
          <div className="text-sm font-medium text-gray-600">Total Staff</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900">
            {fairnessReport.staffDistributions.length}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm font-medium text-gray-600">Desirable Shifts</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900">
            {fairnessReport.totalDesirableShifts}
          </div>
          <div className="mt-1 text-xs text-gray-500">Friday/Saturday evenings</div>
        </Card>

        <Card className="p-6">
          <div className="text-sm font-medium text-gray-600">Total Hours</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900">
            {fairnessReport.staffDistributions
              .reduce((sum, s) => sum + s.totalHours, 0)
              .toFixed(1)}
          </div>
        </Card>
      </div>

      {/* Staff Distribution Table */}
      <Card className="p-3 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Staff Distribution</h2>
        <div className="overflow-x-auto -mx-3 sm:mx-0">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Staff
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hours
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                  Desired
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Variance
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  Shifts
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  Desirable
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {fairnessReport.staffDistributions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 sm:px-6 py-4 text-center text-sm text-gray-500">
                    No staff assignments found for this period
                  </td>
                </tr>
              ) : (
                fairnessReport.staffDistributions.map((staff) => (
                  <tr key={staff.staffId} className="hover:bg-gray-50">
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {staff.staffName}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {staff.totalHours.toFixed(1)}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-600 hidden sm:table-cell">
                      {staff.desiredHours !== null ? `${staff.desiredHours}` : '-'}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm">
                      {staff.desiredHours !== null ? (
                        <span
                          className={
                            staff.variance > 5
                              ? 'text-red-600 font-medium'
                              : staff.variance < -5
                              ? 'text-blue-600 font-medium'
                              : 'text-green-600 font-medium'
                          }
                        >
                          {staff.variance > 0 ? '+' : ''}
                          {staff.variance.toFixed(1)} hrs
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 hidden md:table-cell">
                      {staff.totalShifts}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 hidden md:table-cell">
                      {staff.desirableShifts}
                      {fairnessReport.totalDesirableShifts > 0 && (
                        <span className="ml-1 text-xs text-gray-500">
                          ({Math.round((staff.desirableShifts / fairnessReport.totalDesirableShifts) * 100)}%)
                        </span>
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(staff.status)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Legend */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Understanding the Data</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
          <div>
            <strong>Desirable Shifts:</strong> Friday or Saturday shifts starting at or after 5:00 PM
          </div>
          <div>
            <strong>Variance:</strong> Difference between actual hours worked and desired hours
          </div>
          <div>
            <strong>Fairness Score:</strong> Calculated from desirable shift distribution (50%) and adherence to desired hours (50%)
          </div>
          <div>
            <strong>Status:</strong> Balanced (±5 hrs), Over (&gt;5 hrs over), Under (&gt;5 hrs under)
          </div>
        </div>
      </Card>
    </div>
  );
}
