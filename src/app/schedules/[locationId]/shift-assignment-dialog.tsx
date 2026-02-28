'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { getShiftWithQualifiedStaff, assignStaffToShift, unassignStaffFromShift } from './assignment-actions';
import { analyzeAssignmentImpact } from '@/app/overtime/actions';
import type { AssignmentValidationResult } from '@/lib/constraints';

interface ShiftAssignmentDialogProps {
  shiftId: string | null;
  locationId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface ShiftData {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  headcount: number;
  skill: {
    id: string;
    name: string;
  } | null;
  assignments: Array<{
    assignment: {
      id: string;
      shiftId: string;
      staffId: string;
    };
    staff: {
      id: string;
      name: string;
      email: string;
    };
  }>;
}

interface QualifiedStaff {
  staff: {
    id: string;
    name: string;
    email: string;
  };
  validation: AssignmentValidationResult;
}

interface WhatIfAnalysis {
  staffId: string;
  currentWeeklyHours: number;
  shiftHours: number;
  newWeeklyHours: number;
  currentDailyHours: number;
  newDailyHours: number;
  wouldCauseOvertime: boolean;
  overtimeHours: number;
  projectedCostImpact: number;
  warnings: string[];
}

export function ShiftAssignmentDialog({
  shiftId,
  locationId,
  isOpen,
  onClose,
}: ShiftAssignmentDialogProps) {
  const [shift, setShift] = useState<ShiftData | null>(null);
  const [qualifiedStaff, setQualifiedStaff] = useState<QualifiedStaff[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedStaffForAnalysis, setSelectedStaffForAnalysis] = useState<string | null>(null);
  const [whatIfAnalysis, setWhatIfAnalysis] = useState<WhatIfAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [unassignStaffId, setUnassignStaffId] = useState<string | null>(null);
  const [overrideStaffId, setOverrideStaffId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  const loadShiftData = useCallback(async () => {
    if (!shiftId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await getShiftWithQualifiedStaff(shiftId);

      if (result.success && result.shift && result.qualifiedStaff) {
        setShift(result.shift as unknown as ShiftData);
        setQualifiedStaff(result.qualifiedStaff);
      } else {
        setError(result.error || 'Failed to load shift data');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [shiftId]);

  useEffect(() => {
    if (isOpen && shiftId) {
      loadShiftData();
    }
  }, [isOpen, shiftId, loadShiftData]);

  const handleAssign = async (staffId: string, reason?: string) => {
    if (!shiftId) return;

    setActionLoading(staffId);
    try {
      const result = await assignStaffToShift(shiftId, staffId, locationId, reason);

      if (result.success) {
        setOverrideStaffId(null);
        setOverrideReason('');
        await loadShiftData();
        if (result.warnings && result.warnings.length > 0) {
          toast.warning('Assigned with warnings', {
            description: result.warnings.join('. '),
          });
        }
      } else if ('overridable' in result && result.overridable) {
        // Show the override dialog for 7th consecutive day
        setOverrideStaffId(staffId);
        setOverrideReason('');
      } else {
        toast.error(result.error || 'Failed to assign staff');
      }
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleOverrideConfirm = async () => {
    if (!overrideStaffId || !overrideReason.trim()) return;
    await handleAssign(overrideStaffId, overrideReason.trim());
  };

  const handleUnassign = (staffId: string) => {
    setUnassignStaffId(staffId);
  };

  const confirmUnassign = async () => {
    if (!shiftId || !unassignStaffId) return;

    setActionLoading(unassignStaffId);
    try {
      const result = await unassignStaffFromShift(shiftId, unassignStaffId, locationId);

      if (result.success) {
        await loadShiftData();
      } else {
        toast.error(result.error || 'Failed to unassign staff');
      }
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error(err);
    } finally {
      setActionLoading(null);
      setUnassignStaffId(null);
    }
  };

  const isStaffAssigned = (staffId: string) => {
    return shift?.assignments.some((a) => a.staff.id === staffId) || false;
  };

  const isShiftFull = () => {
    return (shift?.assignments.length || 0) >= (shift?.headcount || 0);
  };

  const handleShowWhatIf = async (staffId: string) => {
    if (!shift) return;

    setSelectedStaffForAnalysis(staffId);
    setAnalysisLoading(true);

    try {
      const result = await analyzeAssignmentImpact(
        staffId,
        shift.date,
        shift.startTime,
        shift.endTime
      );

      setWhatIfAnalysis({
        staffId,
        ...result,
      });
    } catch (err) {
      console.error('Error analyzing assignment impact:', err);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleCloseWhatIf = () => {
    setSelectedStaffForAnalysis(null);
    setWhatIfAnalysis(null);
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Shift Assignments</DialogTitle>
          {shift && (
            <DialogDescription>
              {shift.date} • {shift.startTime.slice(0, 5)} - {shift.endTime.slice(0, 5)} •{' '}
              {shift.skill?.name} • {shift.assignments.length}/{shift.headcount} assigned
            </DialogDescription>
          )}
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-gray-500">Loading...</div>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>
        )}

        {shift && !loading && (
          <div className="space-y-6">
            {/* Currently Assigned Staff */}
            {shift.assignments.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Currently Assigned ({shift.assignments.length})
                </h3>
                <div className="space-y-2">
                  {shift.assignments.map((assignment) => (
                    <div
                      key={assignment.assignment.id}
                      className="flex items-center justify-between rounded-md border border-green-200 bg-green-50 p-3"
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {assignment.staff.name}
                        </div>
                        <div className="text-xs text-gray-600">{assignment.staff.email}</div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnassign(assignment.staff.id)}
                        disabled={actionLoading === assignment.staff.id}
                      >
                        {actionLoading === assignment.staff.id ? 'Removing...' : 'Remove'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Qualified Staff */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                {isShiftFull() ? 'Shift is Full' : 'Available Staff'}
              </h3>
              {qualifiedStaff.length === 0 ? (
                <div className="text-sm text-gray-500">No qualified staff available</div>
              ) : (
                <div className="space-y-2">
                  {qualifiedStaff.map(({ staff, validation }) => {
                    const assigned = isStaffAssigned(staff.id);
                    const errors = validation.violations.filter((v) => v.type === 'error');
                    const hasErrors = errors.length > 0;
                    const hasWarnings = validation.violations.some((v) => v.type === 'warning');
                    const isOnlySeventhDay =
                      errors.length === 1 &&
                      errors[0].code === 'SEVENTH_CONSECUTIVE_DAY';

                    if (assigned) return null;

                    return (
                      <div
                        key={staff.id}
                        className={`flex items-start justify-between rounded-md border p-3 ${
                          hasErrors
                            ? 'border-red-200 bg-red-50'
                            : hasWarnings
                            ? 'border-yellow-200 bg-yellow-50'
                            : 'border-green-200 bg-green-50'
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-gray-900">{staff.name}</div>
                            {validation.valid && (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                                ✓ Available
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">{staff.email}</div>

                          {validation.violations.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {validation.violations.map((violation, idx) => (
                                <div
                                  key={idx}
                                  className={`text-xs ${
                                    violation.type === 'error'
                                      ? 'text-red-700'
                                      : 'text-yellow-700'
                                  }`}
                                >
                                  {violation.type === 'error' ? '✗' : '⚠'} {violation.message}
                                </div>
                              ))}
                            </div>
                          )}

                          {validation.suggestions && validation.suggestions.length > 0 && (
                            <div className="mt-2">
                              {validation.suggestions.map((suggestion, idx) => (
                                <div key={idx} className="text-xs text-blue-700">
                                  💡 {suggestion}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="ml-3 flex flex-col gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleShowWhatIf(staff.id)}
                            disabled={analysisLoading && selectedStaffForAnalysis === staff.id}
                          >
                            {analysisLoading && selectedStaffForAnalysis === staff.id
                              ? 'Analyzing...'
                              : 'What-If?'}
                          </Button>
                          {isOnlySeventhDay ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-orange-300 text-orange-700 hover:bg-orange-50"
                              onClick={() => {
                                setOverrideStaffId(staff.id);
                                setOverrideReason('');
                              }}
                              disabled={isShiftFull() || actionLoading === staff.id}
                            >
                              Override (7th Day)
                            </Button>
                          ) : (
                            <Button
                              variant={validation.valid ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => handleAssign(staff.id)}
                              disabled={
                                hasErrors || isShiftFull() || actionLoading === staff.id
                              }
                            >
                              {actionLoading === staff.id
                                ? 'Assigning...'
                                : hasWarnings
                                ? 'Assign with warnings'
                                : 'Assign'}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* What-If Analysis Panel */}
            {whatIfAnalysis && selectedStaffForAnalysis && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-sm font-semibold text-blue-900">
                    What-If Analysis
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCloseWhatIf}
                    className="h-6 px-2 text-blue-700"
                  >
                    ✕
                  </Button>
                </div>

                <div className="space-y-3 text-sm">
                  {/* Hours Impact */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-blue-700 font-medium">Weekly Hours</p>
                      <p className="text-blue-900">
                        {whatIfAnalysis.currentWeeklyHours.toFixed(1)}h →{' '}
                        <span className={whatIfAnalysis.wouldCauseOvertime ? 'font-bold text-yellow-700' : 'font-bold'}>
                          {whatIfAnalysis.newWeeklyHours.toFixed(1)}h
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-700 font-medium">Daily Hours</p>
                      <p className="text-blue-900">
                        {whatIfAnalysis.currentDailyHours.toFixed(1)}h →{' '}
                        <span className="font-bold">
                          {whatIfAnalysis.newDailyHours.toFixed(1)}h
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Cost Impact */}
                  <div>
                    <p className="text-xs text-blue-700 font-medium">Cost Impact</p>
                    <p className="text-lg font-bold text-green-700">
                      +${whatIfAnalysis.projectedCostImpact.toFixed(2)}
                    </p>
                    {whatIfAnalysis.wouldCauseOvertime && (
                      <p className="text-xs text-yellow-700 font-medium mt-1">
                        Includes {whatIfAnalysis.overtimeHours.toFixed(1)}h overtime
                      </p>
                    )}
                  </div>

                  {/* Warnings */}
                  {whatIfAnalysis.warnings.length > 0 && (
                    <div className="space-y-1">
                      {whatIfAnalysis.warnings.map((warning, idx) => (
                        <div key={idx} className="text-xs text-yellow-700">
                          ⚠ {warning}
                        </div>
                      ))}
                    </div>
                  )}

                  {whatIfAnalysis.warnings.length === 0 && (
                    <div className="text-xs text-green-700">
                      ✓ No labor law concerns
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Unassign Confirmation */}
    <AlertDialog open={!!unassignStaffId} onOpenChange={(open) => { if (!open) setUnassignStaffId(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove assignment</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove this staff member from the shift?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmUnassign} className="bg-red-600 hover:bg-red-700">
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* 7th Consecutive Day Override */}
    <AlertDialog open={!!overrideStaffId} onOpenChange={(open) => { if (!open) { setOverrideStaffId(null); setOverrideReason(''); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>7th Consecutive Day Override</AlertDialogTitle>
          <AlertDialogDescription>
            This staff member would work their 7th consecutive day. A documented reason is required to override this constraint.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <Label htmlFor="override-reason" className="text-sm font-medium">
            Override Reason (required)
          </Label>
          <Textarea
            id="override-reason"
            placeholder="e.g., Short-staffed due to flu season, no other qualified staff available"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            className="mt-2"
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleOverrideConfirm}
            disabled={!overrideReason.trim() || actionLoading === overrideStaffId}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {actionLoading === overrideStaffId ? 'Assigning...' : 'Confirm Override & Assign'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
