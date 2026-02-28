'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { NotificationPreferences, AvailabilityRule, AvailabilityException } from './actions';
import {
  updateNotificationPreferences,
  updateDesiredHours,
  saveAvailabilityRule,
  deleteAvailabilityRule,
  saveAvailabilityException,
  deleteAvailabilityException,
} from './actions';

const DAYS_OF_WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const DAY_LABELS: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

interface SettingsFormProps {
  initialPreferences: NotificationPreferences;
  initialDesiredHours: number | null;
  userRole: string;
  initialAvailabilityRules?: AvailabilityRule[];
  initialAvailabilityExceptions?: AvailabilityException[];
}

export function SettingsForm({
  initialPreferences,
  initialDesiredHours,
  userRole,
  initialAvailabilityRules = [],
  initialAvailabilityExceptions = [],
}: SettingsFormProps) {
  const router = useRouter();
  const [preferences, setPreferences] = useState(initialPreferences);
  const [desiredHours, setDesiredHours] = useState(initialDesiredHours?.toString() || '');
  const [saving, setSaving] = useState(false);

  // Availability state
  const [rules, setRules] = useState<AvailabilityRule[]>(initialAvailabilityRules);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>(initialAvailabilityExceptions);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [dayStartTime, setDayStartTime] = useState('09:00');
  const [dayEndTime, setDayEndTime] = useState('17:00');
  const [savingRule, setSavingRule] = useState(false);

  // Exception form state
  const [showExceptionForm, setShowExceptionForm] = useState(false);
  const [excDate, setExcDate] = useState('');
  const [excAvailable, setExcAvailable] = useState(false);
  const [excStartTime, setExcStartTime] = useState('09:00');
  const [excEndTime, setExcEndTime] = useState('17:00');
  const [excReason, setExcReason] = useState('');
  const [savingException, setSavingException] = useState(false);

  const handleSavePreferences = async () => {
    setSaving(true);
    const result = await updateNotificationPreferences(preferences);

    if (result.success) {
      toast.success('Notification preferences updated');
    } else {
      toast.error(result.error || 'Failed to update preferences');
    }

    setSaving(false);
  };

  const handleSaveDesiredHours = async () => {
    setSaving(true);
    const hours = desiredHours === '' ? null : parseInt(desiredHours);

    if (hours !== null && (hours < 0 || hours > 168)) {
      toast.error('Desired hours must be between 0 and 168');
      setSaving(false);
      return;
    }

    const result = await updateDesiredHours(hours);

    if (result.success) {
      toast.success('Desired hours updated');
    } else {
      toast.error(result.error || 'Failed to update desired hours');
    }

    setSaving(false);
  };

  const handleEditDay = (day: string) => {
    const existing = rules.find(r => r.dayOfWeek === day);
    if (existing) {
      setDayStartTime(existing.startTime.slice(0, 5));
      setDayEndTime(existing.endTime.slice(0, 5));
    } else {
      setDayStartTime('09:00');
      setDayEndTime('17:00');
    }
    setEditingDay(day);
  };

  const handleSaveRule = async () => {
    if (!editingDay) return;
    setSavingRule(true);

    const result = await saveAvailabilityRule(
      editingDay as AvailabilityRule['dayOfWeek'],
      dayStartTime,
      dayEndTime
    );

    if (result.success) {
      toast.success(`${DAY_LABELS[editingDay]} availability saved`);
      // Update local state
      const updated = rules.filter(r => r.dayOfWeek !== editingDay);
      updated.push({
        id: 'temp',
        dayOfWeek: editingDay as AvailabilityRule['dayOfWeek'],
        startTime: dayStartTime,
        endTime: dayEndTime,
      });
      setRules(updated);
      setEditingDay(null);
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to save');
    }

    setSavingRule(false);
  };

  const handleDeleteRule = async (rule: AvailabilityRule) => {
    const result = await deleteAvailabilityRule(rule.id);
    if (result.success) {
      toast.success(`${DAY_LABELS[rule.dayOfWeek]} availability removed`);
      setRules(rules.filter(r => r.id !== rule.id));
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to delete');
    }
  };

  const handleSaveException = async () => {
    if (!excDate) {
      toast.error('Date is required');
      return;
    }
    setSavingException(true);

    const result = await saveAvailabilityException(
      excDate,
      excAvailable,
      excAvailable ? excStartTime : null,
      excAvailable ? excEndTime : null,
      excReason || null
    );

    if (result.success) {
      toast.success('Availability exception saved');
      setExceptions([...exceptions.filter(e => e.date !== excDate), {
        id: 'temp',
        date: excDate,
        isAvailable: excAvailable,
        startTime: excAvailable ? excStartTime : null,
        endTime: excAvailable ? excEndTime : null,
        reason: excReason || null,
      }]);
      setShowExceptionForm(false);
      setExcDate('');
      setExcReason('');
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to save');
    }

    setSavingException(false);
  };

  const handleDeleteException = async (exc: AvailabilityException) => {
    const result = await deleteAvailabilityException(exc.id);
    if (result.success) {
      toast.success('Exception removed');
      setExceptions(exceptions.filter(e => e.id !== exc.id));
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to delete');
    }
  };

  const getRuleForDay = (day: string) => rules.find(r => r.dayOfWeek === day);

  return (
    <div className="space-y-6">
      {/* Availability Management (Staff Only) */}
      {userRole === 'STAFF' && (
        <>
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Weekly Availability
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              Set your recurring weekly availability. Managers will only assign you shifts within these windows.
            </p>

            <div className="space-y-2">
              {DAYS_OF_WEEK.map((day) => {
                const rule = getRuleForDay(day);
                const isEditing = editingDay === day;

                return (
                  <div key={day} className="flex items-center gap-3 rounded-lg border p-3">
                    <span className="w-24 text-sm font-medium text-gray-700">
                      {DAY_LABELS[day]}
                    </span>

                    {isEditing ? (
                      <div className="flex flex-1 items-center gap-2">
                        <input
                          type="time"
                          value={dayStartTime}
                          onChange={(e) => setDayStartTime(e.target.value)}
                          className="rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-gray-500">to</span>
                        <input
                          type="time"
                          value={dayEndTime}
                          onChange={(e) => setDayEndTime(e.target.value)}
                          className="rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                        <Button size="sm" onClick={handleSaveRule} disabled={savingRule}>
                          {savingRule ? 'Saving...' : 'Save'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingDay(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-1 items-center justify-between">
                        {rule ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="default" className="bg-green-600">
                              {rule.startTime.slice(0, 5)} - {rule.endTime.slice(0, 5)}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">Not set (unavailable)</span>
                        )}
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleEditDay(day)}>
                            {rule ? 'Edit' : 'Set'}
                          </Button>
                          {rule && (
                            <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDeleteRule(rule)}>
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Availability Exceptions
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Override your regular availability for specific dates (vacations, appointments, extra availability).
                </p>
              </div>
              <Button size="sm" onClick={() => setShowExceptionForm(true)}>
                Add Exception
              </Button>
            </div>

            {showExceptionForm && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input
                      type="date"
                      value={excDate}
                      onChange={(e) => setExcDate(e.target.value)}
                      className="block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={excAvailable ? 'available' : 'unavailable'}
                      onChange={(e) => setExcAvailable(e.target.value === 'available')}
                      className="block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                      <option value="unavailable">Unavailable (day off)</option>
                      <option value="available">Available (custom hours)</option>
                    </select>
                  </div>
                </div>

                {excAvailable && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                      <input
                        type="time"
                        value={excStartTime}
                        onChange={(e) => setExcStartTime(e.target.value)}
                        className="block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                      <input
                        type="time"
                        value={excEndTime}
                        onChange={(e) => setExcEndTime(e.target.value)}
                        className="block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
                  <input
                    type="text"
                    value={excReason}
                    onChange={(e) => setExcReason(e.target.value)}
                    placeholder="e.g., Vacation, Doctor appointment"
                    className="block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveException} disabled={savingException}>
                    {savingException ? 'Saving...' : 'Save Exception'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowExceptionForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {exceptions.length === 0 && !showExceptionForm ? (
              <p className="text-sm text-gray-400">No exceptions set. Your regular weekly schedule applies.</p>
            ) : (
              <div className="space-y-2">
                {exceptions
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((exc) => (
                    <div key={exc.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700">{exc.date}</span>
                        {exc.isAvailable ? (
                          <Badge variant="default" className="bg-green-600">
                            Available {exc.startTime?.slice(0, 5)}-{exc.endTime?.slice(0, 5)}
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Unavailable</Badge>
                        )}
                        {exc.reason && (
                          <span className="text-xs text-gray-500">{exc.reason}</span>
                        )}
                      </div>
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDeleteException(exc)}>
                        Remove
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Desired Hours (Staff Only) */}
      {userRole === 'STAFF' && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Desired Weekly Hours
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Set your desired weekly hours to help managers create fair schedules. This is used in the fairness analytics dashboard.
          </p>

          <div className="max-w-xs">
            <label
              htmlFor="desiredHours"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Weekly Hours
            </label>
            <input
              id="desiredHours"
              type="number"
              min="0"
              max="168"
              value={desiredHours}
              onChange={(e) => setDesiredHours(e.target.value)}
              placeholder="e.g., 40"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
            <p className="mt-2 text-xs text-gray-500">
              Leave blank if you don&apos;t have a preference
            </p>
          </div>

          <div className="mt-6">
            <Button onClick={handleSaveDesiredHours} disabled={saving}>
              {saving ? 'Saving...' : 'Save Desired Hours'}
            </Button>
          </div>
        </Card>
      )}

      {/* Notification Preferences */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Notification Preferences
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          Choose how you want to receive notifications about shifts, swaps, and schedule changes.
        </p>

        <div className="space-y-4">
          <div className="flex items-start">
            <div className="flex items-center h-5">
              <input
                id="inApp"
                type="checkbox"
                checked={preferences.inApp}
                onChange={(e) =>
                  setPreferences({ ...preferences, inApp: e.target.checked })
                }
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="ml-3">
              <label htmlFor="inApp" className="font-medium text-gray-700">
                In-App Notifications
              </label>
              <p className="text-sm text-gray-500">
                Receive notifications in the notification center at the top of the page
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex items-center h-5">
              <input
                id="email"
                type="checkbox"
                checked={preferences.email}
                onChange={(e) =>
                  setPreferences({ ...preferences, email: e.target.checked })
                }
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="ml-3">
              <label htmlFor="email" className="font-medium text-gray-700">
                Email Notifications (Simulated)
              </label>
              <p className="text-sm text-gray-500">
                Email notifications are logged but not actually sent in this demo
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <Button onClick={handleSavePreferences} disabled={saving}>
            {saving ? 'Saving...' : 'Save Preferences'}
          </Button>
        </div>
      </Card>

      {/* About Notifications */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          About Notifications
        </h2>
        <div className="space-y-3 text-sm text-gray-600">
          <div className="flex items-start">
            <span className="text-blue-500 mr-2">•</span>
            <span>
              <strong>Shift Assigned:</strong> When a manager assigns you to a shift
            </span>
          </div>
          <div className="flex items-start">
            <span className="text-blue-500 mr-2">•</span>
            <span>
              <strong>Shift Changed:</strong> When a shift you&apos;re assigned to is modified
            </span>
          </div>
          <div className="flex items-start">
            <span className="text-blue-500 mr-2">•</span>
            <span>
              <strong>Schedule Published:</strong> When a manager publishes a new schedule
            </span>
          </div>
          <div className="flex items-start">
            <span className="text-blue-500 mr-2">•</span>
            <span>
              <strong>Swap Requests:</strong> Updates on your swap and drop requests
            </span>
          </div>
          {(userRole === 'MANAGER' || userRole === 'ADMIN') && (
            <>
              <div className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <span>
                  <strong>Swap Approvals:</strong> When staff request shift swaps or drops
                </span>
              </div>
              <div className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <span>
                  <strong>Overtime Warnings:</strong> When assignments would cause overtime
                </span>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
