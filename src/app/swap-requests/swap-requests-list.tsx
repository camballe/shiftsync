'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useRealtimeSubscription, type RealtimeEvent } from '@/lib/hooks/useRealtimeSubscription';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { SwapRequestDetail } from './actions';
import {
  approveSwapRequest,
  denySwapRequest,
  cancelSwapRequest,
  acceptSwapAsTarget,
  declineSwapAsTarget,
} from './actions';

interface SwapRequestsListProps {
  requests: SwapRequestDetail[];
  incomingRequests?: SwapRequestDetail[];
  userRole?: string;
  userId?: string;
}

type ActionType = 'approve' | 'deny' | 'cancel' | 'accept_swap' | 'decline_swap' | null;

export function SwapRequestsList({ requests, incomingRequests = [], userRole, userId }: SwapRequestsListProps) {
  const router = useRouter();
  const [selectedRequest, setSelectedRequest] = useState<SwapRequestDetail | null>(null);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSwapRequestsChange = useCallback((event: RealtimeEvent) => {
    router.refresh();

    if (event.eventType === 'INSERT') {
      toast.info('New swap request', {
        description: 'A new swap/drop request has been submitted',
      });
    } else if (event.eventType === 'UPDATE') {
      toast.info('Swap request updated', {
        description: 'A swap request status has changed',
      });
    }
  }, [router]);

  const isManager = userRole === 'MANAGER' || userRole === 'ADMIN';
  const swapFilter = !isManager && userId ? `requested_by=eq.${userId}` : undefined;

  const { isConnected } = useRealtimeSubscription({
    table: 'swap_requests',
    filter: swapFilter,
    onChange: handleSwapRequestsChange,
  });

  const handleAction = (request: SwapRequestDetail, action: ActionType) => {
    setSelectedRequest(request);
    setActionType(action);
    setNotes('');
  };

  const handleSubmit = async () => {
    if (!selectedRequest || !actionType) return;

    setIsSubmitting(true);
    try {
      let result;
      if (actionType === 'cancel') {
        result = await cancelSwapRequest(selectedRequest.id);
      } else if (actionType === 'approve') {
        result = await approveSwapRequest(selectedRequest.id, notes || undefined);
      } else if (actionType === 'deny') {
        result = await denySwapRequest(selectedRequest.id, notes || undefined);
      } else if (actionType === 'accept_swap') {
        result = await acceptSwapAsTarget(selectedRequest.id);
      } else if (actionType === 'decline_swap') {
        result = await declineSwapAsTarget(selectedRequest.id);
      } else {
        return;
      }

      if (result.success) {
        const labels: Record<string, string> = {
          approve: 'approved',
          deny: 'denied',
          cancel: 'cancelled',
          accept_swap: 'accepted',
          decline_swap: 'declined',
        };
        toast.success(`Request ${labels[actionType]}`, {
          description: `The swap request has been ${labels[actionType]}`,
        });
        handleClose();
        router.refresh();
      } else {
        toast.error('Error', {
          description: result.error || `Failed to process request`,
        });
      }
    } catch {
      toast.error('Error', {
        description: `Failed to process request`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedRequest(null);
    setActionType(null);
    setNotes('');
  };

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
    return time.slice(0, 5);
  };

  const formatDateTime = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED': return <Badge variant="default">Approved</Badge>;
      case 'DENIED': return <Badge variant="destructive">Denied</Badge>;
      case 'CANCELLED': return <Badge variant="secondary">Cancelled</Badge>;
      case 'ACCEPTED_BY_TARGET': return <Badge className="bg-blue-600">Accepted by Target</Badge>;
      default: return <Badge variant="outline">Pending</Badge>;
    }
  };

  // Check if the request is actionable for this manager
  const isManagerActionable = (request: SwapRequestDetail) => {
    if (!isManager) return false;
    if (request.type === 'DROP' && request.status === 'PENDING') return true;
    if (request.type === 'SWAP' && request.status === 'ACCEPTED_BY_TARGET') return true;
    return false;
  };

  const hasNoContent = requests.length === 0 && incomingRequests.length === 0;

  if (hasNoContent) {
    const isStaff = userRole === 'STAFF';
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No pending requests</h3>
          <p className="mt-2 text-sm text-gray-500">
            {isStaff
              ? 'You have no swap or drop requests. You can create one from My Shifts.'
              : 'There are no swap or drop requests awaiting your approval'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const renderRequestCard = (request: SwapRequestDetail, isIncoming: boolean = false) => (
    <Card key={request.id}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">
                {isIncoming
                  ? 'Incoming Swap Request'
                  : request.type === 'SWAP'
                  ? 'Shift Swap Request'
                  : 'Drop Shift Request'}
              </CardTitle>
              <Badge variant={request.type === 'SWAP' ? 'default' : 'secondary'}>
                {request.type}
              </Badge>
              {isIncoming && (
                <Badge className="bg-orange-500">Action Required</Badge>
              )}
            </div>
            <CardDescription className="mt-1">
              Requested by {request.requestedBy.name} on {formatDateTime(request.createdAt)}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Shift Details */}
        <div className="rounded-lg bg-gray-50 p-4">
          <h4 className="mb-2 font-medium text-gray-900">Shift Details</h4>
          <div className="grid gap-2 text-sm md:grid-cols-2">
            <div>
              <span className="text-gray-600">Date:</span>{' '}
              <span className="font-medium">{formatDate(request.shift.date)}</span>
            </div>
            <div>
              <span className="text-gray-600">Time:</span>{' '}
              <span className="font-medium">
                {formatTime(request.shift.startTime)} - {formatTime(request.shift.endTime)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Location:</span>{' '}
              <span className="font-medium">{request.shift.location.name}</span>
            </div>
            <div>
              <span className="text-gray-600">Skill:</span>{' '}
              <span className="font-medium">{request.shift.skill.name}</span>
            </div>
          </div>
        </div>

        {/* Request Details */}
        <div className="rounded-lg bg-blue-50 p-4">
          <h4 className="mb-2 font-medium text-blue-900">Request Information</h4>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-blue-800">Current assignee:</span>{' '}
              <span className="font-medium text-blue-900">
                {request.requestedBy.name} ({request.requestedBy.email})
              </span>
            </div>
            {request.type === 'SWAP' && request.targetStaff && (
              <div>
                <span className="text-blue-800">Swap with:</span>{' '}
                <span className="font-medium text-blue-900">
                  {request.targetStaff.name} ({request.targetStaff.email})
                </span>
              </div>
            )}
            {request.type === 'DROP' && (
              <div className="text-blue-800">
                This shift will be unassigned if approved. You can assign it to someone else later.
              </div>
            )}
          </div>
        </div>

        {/* Swap workflow step indicator for managers */}
        {isManager && request.type === 'SWAP' && request.status === 'ACCEPTED_BY_TARGET' && (
          <div className="rounded-lg bg-green-50 p-4">
            <div className="flex items-center gap-2 text-sm text-green-800">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">Target staff has accepted this swap. Ready for your approval.</span>
            </div>
          </div>
        )}

        {/* Status Badge for non-actionable requests */}
        {request.status !== 'PENDING' && request.status !== 'ACCEPTED_BY_TARGET' && (
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">Status:</span>
              {getStatusBadge(request.status)}
              {request.reviewNotes && (
                <span className="text-gray-500">&mdash; {request.reviewNotes}</span>
              )}
            </div>
          </div>
        )}

        {/* Staff own request: show status for ACCEPTED_BY_TARGET */}
        {!isIncoming && userRole === 'STAFF' && request.status === 'ACCEPTED_BY_TARGET' && (
          <div className="rounded-lg bg-blue-50 p-4">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">
                {request.targetStaff?.name || 'Target staff'} accepted. Awaiting manager approval.
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        {isIncoming && request.status === 'PENDING' && (
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <Button
              onClick={() => handleAction(request, 'accept_swap')}
              className="flex-1"
              variant="default"
            >
              Accept Swap
            </Button>
            <Button
              onClick={() => handleAction(request, 'decline_swap')}
              className="flex-1"
              variant="destructive"
            >
              Decline
            </Button>
          </div>
        )}

        {!isIncoming && isManagerActionable(request) && (
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <Button
              onClick={() => handleAction(request, 'approve')}
              className="flex-1"
              variant="default"
            >
              Approve
            </Button>
            <Button
              onClick={() => handleAction(request, 'deny')}
              className="flex-1"
              variant="destructive"
            >
              Deny
            </Button>
          </div>
        )}

        {!isIncoming && userRole === 'STAFF' && (request.status === 'PENDING' || request.status === 'ACCEPTED_BY_TARGET') && (
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <Button
              onClick={() => handleAction(request, 'cancel')}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Cancel Request
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <>
      {!isConnected && (
        <div className="mb-4 rounded-md bg-yellow-50 p-4">
          <p className="text-sm text-yellow-800">
            Connecting to live updates...
          </p>
        </div>
      )}

      {/* Incoming Swap Requests (Staff B acceptance) */}
      {incomingRequests.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Incoming Swap Requests ({incomingRequests.length})
          </h2>
          <p className="mb-4 text-sm text-gray-600">
            These swap requests need your acceptance before they go to a manager for approval.
          </p>
          <div className="space-y-4">
            {incomingRequests.map((request) => renderRequestCard(request, true))}
          </div>
        </div>
      )}

      {/* Own / Manager Requests */}
      {requests.length > 0 && (
        <div>
          {incomingRequests.length > 0 && (
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {userRole === 'STAFF' ? 'Your Requests' : 'Requests for Approval'}
            </h2>
          )}
          <div className="space-y-4">
            {requests.map((request) => renderRequestCard(request, false))}
          </div>
        </div>
      )}

      {/* Action Confirmation Dialog */}
      <Dialog open={!!actionType} onOpenChange={() => handleClose()}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve' :
               actionType === 'deny' ? 'Deny' :
               actionType === 'accept_swap' ? 'Accept' :
               actionType === 'decline_swap' ? 'Decline' :
               'Cancel'} Swap Request
            </DialogTitle>
            <DialogDescription>
              {actionType === 'approve'
                ? 'This will reassign the shift as requested.'
                : actionType === 'deny'
                ? 'This will reject the swap request.'
                : actionType === 'accept_swap'
                ? 'You agree to take this shift. The request will then go to a manager for final approval.'
                : actionType === 'decline_swap'
                ? 'You are declining this swap request.'
                : 'This will cancel your swap/drop request.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedRequest && (
              <div className="rounded-lg bg-gray-50 p-4 text-sm">
                <p>
                  <strong>Shift:</strong> {formatDate(selectedRequest.shift.date)},{' '}
                  {formatTime(selectedRequest.shift.startTime)} - {formatTime(selectedRequest.shift.endTime)}
                </p>
                <p className="mt-1">
                  <strong>Location:</strong> {selectedRequest.shift.location.name}
                </p>
                <p className="mt-1">
                  <strong>Requested by:</strong> {selectedRequest.requestedBy.name}
                </p>
                {selectedRequest.type === 'SWAP' && selectedRequest.targetStaff && (
                  <p className="mt-1">
                    <strong>Swap with:</strong> {selectedRequest.targetStaff.name}
                  </p>
                )}
              </div>
            )}

            {(actionType === 'approve' || actionType === 'deny' || actionType === 'cancel') && (
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Add a note about your decision..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Go Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              variant={
                actionType === 'approve' || actionType === 'accept_swap'
                  ? 'default'
                  : 'destructive'
              }
            >
              {isSubmitting
                ? 'Processing...'
                : actionType === 'approve'
                ? 'Approve'
                : actionType === 'deny'
                ? 'Deny'
                : actionType === 'accept_swap'
                ? 'Accept Swap'
                : actionType === 'decline_swap'
                ? 'Decline Swap'
                : 'Cancel Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
