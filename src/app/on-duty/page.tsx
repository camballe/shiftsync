import { requireRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { OnDutyDashboard } from './on-duty-dashboard';
import { getOnDutyStaff } from './actions';
import { AppNav } from '@/components/app-nav';
import { getMyNotifications } from '@/app/notifications/actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OnDutyPage() {
  const user = await requireRole('MANAGER', 'ADMIN').catch(() => null);

  if (!user) {
    redirect('/login');
  }

  // Fetch on-duty staff and notifications
  const [onDutyStaff, notifications] = await Promise.all([
    getOnDutyStaff(),
    getMyNotifications(),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav
        userName={user.name}
        userRole={user.role}
        notifications={notifications}
        userId={user.id}
        title="On-Duty Now"
      />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <OnDutyDashboard
          onDutyStaff={onDutyStaff}
        />
      </div>
    </div>
  );
}
