'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { AuditLogEntry } from './actions';
import { exportAuditLogsCSV } from './actions';
import { toast } from 'sonner';
import { formatDateLocal } from '@/lib/date-utils';

interface AuditDashboardProps {
  auditLogs: AuditLogEntry[];
  locations: Array<{ id: string; name: string }>;
  startDate: Date;
  endDate: Date;
  selectedLocationId?: string;
}

export function AuditDashboard({
  auditLogs,
  locations,
  startDate,
  endDate,
  selectedLocationId,
}: AuditDashboardProps) {
  const router = useRouter();
  const [localStartDate, setLocalStartDate] = useState(
    formatDateLocal(startDate)
  );
  const [localEndDate, setLocalEndDate] = useState(
    formatDateLocal(endDate)
  );
  const [localLocationId, setLocalLocationId] = useState(selectedLocationId || 'all');
  const [exporting, setExporting] = useState(false);

  const handleApplyFilters = () => {
    const params = new URLSearchParams();
    params.set('startDate', localStartDate);
    params.set('endDate', localEndDate);
    if (localLocationId !== 'all') {
      params.set('location', localLocationId);
    }
    router.push(`/audit?${params.toString()}`);
  };

  const handleQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    setLocalStartDate(formatDateLocal(start));
    setLocalEndDate(formatDateLocal(end));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const csv = await exportAuditLogsCSV(
        new Date(localStartDate),
        new Date(localEndDate),
        localLocationId !== 'all' ? localLocationId : undefined
      );

      // Create download
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${localStartDate}-to-${localEndDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('Audit logs exported successfully');
    } catch {
      toast.error('Failed to export audit logs');
    } finally {
      setExporting(false);
    }
  };

  const getActionBadge = (action: string) => {
    const styles: Record<string, string> = {
      CREATE: 'bg-green-100 text-green-800',
      UPDATE: 'bg-blue-100 text-blue-800',
      DELETE: 'bg-red-100 text-red-800',
      shift_created: 'bg-green-100 text-green-800',
      shift_updated: 'bg-blue-100 text-blue-800',
      shift_deleted: 'bg-red-100 text-red-800',
      shift_published: 'bg-purple-100 text-purple-800',
      shift_unpublished: 'bg-gray-100 text-gray-800',
      assignment_created: 'bg-green-100 text-green-800',
      assignment_deleted: 'bg-red-100 text-red-800',
      swap_requested: 'bg-yellow-100 text-yellow-800',
      swap_approved: 'bg-green-100 text-green-800',
      swap_denied: 'bg-red-100 text-red-800',
      swap_cancelled: 'bg-gray-100 text-gray-800',
    };

    return (
      <Badge
        variant="outline"
        className={styles[action] || 'bg-gray-100 text-gray-800'}
      >
        {action.replace(/_/g, ' ').toUpperCase()}
      </Badge>
    );
  };

  const formatTimestamp = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Audit Logs</h1>
        <p className="mt-1 text-sm text-gray-600">
          View and export system audit trail
        </p>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full sm:flex-1 sm:min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <Select value={localLocationId} onValueChange={setLocalLocationId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
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

          <div className="flex gap-2 w-full sm:w-auto">
            <Button onClick={handleApplyFilters} className="flex-1 sm:flex-none">Apply</Button>
            <Button
              onClick={handleExport}
              disabled={exporting}
              variant="outline"
              className="flex-1 sm:flex-none"
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={() => handleQuickRange(1)}>
            24h
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickRange(7)}>
            7 days
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickRange(30)}>
            30 days
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickRange(90)}>
            90 days
          </Button>
        </div>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-4 sm:p-6">
          <div className="text-sm font-medium text-gray-600">Total Events</div>
          <div className="mt-2 text-2xl sm:text-3xl font-semibold text-gray-900">
            {auditLogs.length}
          </div>
        </Card>

        <Card className="p-4 sm:p-6">
          <div className="text-sm font-medium text-gray-600">Unique Users</div>
          <div className="mt-2 text-2xl sm:text-3xl font-semibold text-gray-900">
            {new Set(auditLogs.map((log) => log.changedBy.id)).size}
          </div>
        </Card>

        <Card className="p-4 sm:p-6 col-span-2 sm:col-span-1">
          <div className="text-sm font-medium text-gray-600">Date Range</div>
          <div className="mt-2 text-lg font-semibold text-gray-900">
            {Math.ceil((new Date(localEndDate).getTime() - new Date(localStartDate).getTime()) / (1000 * 60 * 60 * 24))} days
          </div>
        </Card>
      </div>

      {/* Audit Log — Cards on mobile, table on desktop */}
      <Card className="p-3 sm:p-6">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Entity
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Changed By
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-sm text-gray-500">
                    No audit logs found for this period
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatTimestamp(log.createdAt)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {getActionBadge(log.action)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {log.entityType}
                      {log.shift && (
                        <div className="text-xs text-gray-500">
                          {log.shift.date} {log.shift.startTime}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {log.changedBy.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {log.changedBy.role}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {log.shift?.locationName || 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden space-y-3">
          {auditLogs.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-4">
              No audit logs found for this period
            </p>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="rounded-lg border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  {getActionBadge(log.action)}
                  <span className="text-xs text-gray-500">{formatTimestamp(log.createdAt)}</span>
                </div>
                <div className="text-sm text-gray-900">
                  <span className="font-medium">{log.entityType}</span>
                  {log.shift && (
                    <span className="text-gray-500"> — {log.shift.date} {log.shift.startTime}</span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>{log.changedBy.name} ({log.changedBy.role})</span>
                  <span>{log.shift?.locationName || 'N/A'}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
