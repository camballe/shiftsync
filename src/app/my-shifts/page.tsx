import { requireRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { MyShiftsCalendar } from './my-shifts-calendar';
import { getMyShifts, getPendingSwapCount, getAvailableShifts } from './actions';
import { AppNav } from '@/components/app-nav';
import { getMyNotifications } from '@/app/notifications/actions';

export default async function MyShiftsPage() {
  // Require STAFF role
  const user = await requireRole('STAFF').catch(() => null);

  if (!user) {
    redirect('/login');
  }

  // Fetch shifts, pending swap count, available shifts, and notifications
  const [shifts, pendingSwapCount, availableShifts, notifications] = await Promise.all([
    getMyShifts(),
    getPendingSwapCount(),
    getAvailableShifts(),
    getMyNotifications(),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav
        userName={user.name}
        userRole={user.role}
        notifications={notifications}
        userId={user.id}
        title="My Shifts"
      />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {pendingSwapCount > 0 && (
          <div className="mb-6 rounded-md bg-blue-50 p-4">
            <p className="text-sm text-blue-800">
              You have {pendingSwapCount} pending swap/drop request{pendingSwapCount > 1 ? 's' : ''} awaiting manager approval
              {pendingSwapCount >= 3 && ' (maximum reached)'}
            </p>
          </div>
        )}

        <MyShiftsCalendar
          shifts={shifts}
          pendingSwapCount={pendingSwapCount}
          userId={user.id}
          availableShifts={availableShifts}
        />
      </div>
    </div>
  );
}
