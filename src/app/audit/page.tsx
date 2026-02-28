import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AuditDashboard } from './audit-dashboard';
import { getAuditLogs } from './actions';
import { db } from '@/db';
import { locations, managerLocations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { AppNav } from '@/components/app-nav';
import { getMyNotifications } from '@/app/notifications/actions';

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string; location?: string }>;
}) {
  const user = await requireAuth().catch(() => null);

  if (!user || user.role === 'STAFF') {
    redirect('/login');
  }

  const params = await searchParams;

  // Managers can only view audit logs for their assigned locations
  let allLocations;
  if (user.role === 'MANAGER') {
    const managerLocs = await db
      .select({ locationId: managerLocations.locationId })
      .from(managerLocations)
      .where(eq(managerLocations.managerId, user.id));

    const locIds = managerLocs.map(l => l.locationId);
    const allLocs = await db.select().from(locations);
    allLocations = allLocs.filter(l => locIds.includes(l.id));
  } else {
    allLocations = await db.select().from(locations);
  }

  // Get date range (default to last 7 days)
  const endDate = params.endDate
    ? new Date(params.endDate)
    : new Date();
  const startDate = params.startDate
    ? new Date(params.startDate)
    : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  // For managers, force location filter to one of their assigned locations
  let locationId = params.location;
  if (user.role === 'MANAGER' && !locationId && allLocations.length > 0) {
    locationId = allLocations[0].id;
  }
  // Ensure managers can't query locations they don't manage
  if (user.role === 'MANAGER' && locationId && !allLocations.some(l => l.id === locationId)) {
    locationId = allLocations[0]?.id;
  }

  // Fetch audit logs and notifications
  const [auditLogs, notifications] = await Promise.all([
    getAuditLogs(startDate, endDate, locationId),
    getMyNotifications(),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav
        userName={user.name}
        userRole={user.role}
        notifications={notifications}
        userId={user.id}
        title="Audit Logs"
      />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AuditDashboard
          auditLogs={auditLogs}
          locations={allLocations}
          startDate={startDate}
          endDate={endDate}
          selectedLocationId={locationId}
        />
      </div>
    </div>
  );
}
