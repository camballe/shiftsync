'use client';

import { useState } from 'react';
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
import type { MyShift } from './actions';
import { createDropRequest } from './swap-actions';

interface DropRequestDialogProps {
  shift: MyShift | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DropRequestDialog({ shift, isOpen, onClose }: DropRequestDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!shift) return;

    setIsLoading(true);
    try {
      const result = await createDropRequest(shift.assignment.id);

      if (result.success) {
        toast.success('Drop request submitted', {
          description: 'Your shift has been offered for pickup. Awaiting manager approval.',
        });
        onClose();
      } else {
        toast.error('Error', {
          description: result.error || 'Failed to create drop request',
        });
      }
    } catch {
      toast.error('Error', {
        description: 'Failed to create drop request',
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

  // Check if within 24 hours
  const shiftDateTime = new Date(`${shift.date}T${shift.startTime}`);
  const now = new Date();
  const hoursUntilShift = (shiftDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  const isWithin24Hours = hoursUntilShift <= 24;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Drop Shift</DialogTitle>
          <DialogDescription>
            Offer this shift for any qualified staff member to pick up.
            A manager must approve the final change.
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

          {/* 24-hour warning */}
          {isWithin24Hours && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-medium">Cannot drop this shift</p>
              <p className="mt-1">
                Drop requests must be made at least 24 hours before the shift starts.
                This shift is scheduled to start in {Math.round(hoursUntilShift)} hours.
              </p>
            </div>
          )}

          {/* Info Box */}
          <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-800">
            <p className="font-medium">How drop requests work:</p>
            <ol className="mt-2 ml-4 list-decimal space-y-1">
              <li>Your shift will be offered to all qualified staff members</li>
              <li>Any qualified staff can claim the shift</li>
              <li>A manager must approve before the shift is reassigned</li>
              <li>You&apos;ll remain assigned to this shift until approval</li>
              <li>The request expires 24 hours before the shift if unclaimed</li>
            </ol>
          </div>

          {/* Warning */}
          <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
            <p>
              <strong>Note:</strong> If you drop this shift and no one picks it up,
              you may still be required to work it.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || isWithin24Hours}
            variant="destructive"
          >
            {isLoading ? 'Submitting...' : 'Drop Shift'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
