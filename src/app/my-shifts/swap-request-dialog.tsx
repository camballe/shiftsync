'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MyShift } from './actions';
import { getEligibleStaffForSwap, createSwapRequest } from './swap-actions';

interface SwapRequestDialogProps {
  shift: MyShift | null;
  isOpen: boolean;
  onClose: () => void;
}

interface EligibleStaff {
  id: string;
  name: string;
  email: string;
}

export function SwapRequestDialog({ shift, isOpen, onClose }: SwapRequestDialogProps) {
  const [eligibleStaff, setEligibleStaff] = useState<EligibleStaff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingStaff, setIsFetchingStaff] = useState(false);

  const fetchEligibleStaff = useCallback(async () => {
    if (!shift) return;

    setIsFetchingStaff(true);
    try {
      const result = await getEligibleStaffForSwap(
        shift.assignment.id,
        shift.date,
        shift.startTime,
        shift.endTime,
        shift.skill.id,
        shift.location.id
      );

      if (result.success && result.staff) {
        setEligibleStaff(result.staff);
      } else {
        toast.error('Error', {
          description: result.error || 'Failed to fetch eligible staff',
        });
      }
    } catch {
      toast.error('Error', {
        description: 'Failed to fetch eligible staff',
      });
    } finally {
      setIsFetchingStaff(false);
    }
  }, [shift]);

  // Fetch eligible staff when dialog opens
  useEffect(() => {
    if (isOpen && shift) {
      fetchEligibleStaff();
    } else {
      setEligibleStaff([]);
      setSelectedStaffId('');
    }
  }, [isOpen, shift, fetchEligibleStaff]);

  const handleSubmit = async () => {
    if (!shift || !selectedStaffId) return;

    setIsLoading(true);
    try {
      const result = await createSwapRequest(shift.assignment.id, selectedStaffId);

      if (result.success) {
        toast.success('Swap request submitted', {
          description: 'Your swap request has been sent. Awaiting acceptance and manager approval.',
        });
        onClose();
      } else {
        toast.error('Error', {
          description: result.error || 'Failed to create swap request',
        });
      }
    } catch {
      toast.error('Error', {
        description: 'Failed to create swap request',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!shift) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (time: string) => {
    return time.slice(0, 5);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Request Shift Swap</DialogTitle>
          <DialogDescription>
            Select a qualified staff member to swap this shift with. They must accept,
            and then a manager must approve the swap.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Shift Details */}
          <div className="rounded-lg bg-gray-50 p-4 space-y-2">
            <h4 className="font-medium text-gray-900">Shift Details</h4>
            <div className="text-sm space-y-1">
              <p>
                <span className="text-gray-600">Date:</span>{' '}
                <span className="font-medium">{formatDate(shift.date)}</span>
              </p>
              <p>
                <span className="text-gray-600">Time:</span>{' '}
                <span className="font-medium">
                  {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
                </span>
              </p>
              <p>
                <span className="text-gray-600">Location:</span>{' '}
                <span className="font-medium">{shift.location.name}</span>
              </p>
              <p>
                <span className="text-gray-600">Skill:</span>{' '}
                <span className="font-medium">{shift.skill.name}</span>
              </p>
            </div>
          </div>

          {/* Staff Selection */}
          <div className="space-y-2">
            <Label htmlFor="staff">Select Staff Member</Label>
            {isFetchingStaff ? (
              <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-600">
                Loading eligible staff...
              </div>
            ) : eligibleStaff.length === 0 ? (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                No eligible staff members found. Staff must have the required skill,
                be certified for this location, and be available during this time.
              </div>
            ) : (
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger id="staff">
                  <SelectValue placeholder="Choose a staff member" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleStaff.map((staff) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.name} ({staff.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-gray-500">
              Only staff members who meet all requirements are shown
            </p>
          </div>

          {/* Info Box */}
          <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-800">
            <p className="font-medium">How swap requests work:</p>
            <ol className="mt-2 ml-4 list-decimal space-y-1">
              <li>The selected staff member must accept your swap request</li>
              <li>Once accepted, a manager must approve the swap</li>
              <li>You&apos;ll remain assigned to this shift until approval</li>
              <li>All parties will be notified at each step</li>
            </ol>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedStaffId || isLoading || eligibleStaff.length === 0}
          >
            {isLoading ? 'Submitting...' : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
