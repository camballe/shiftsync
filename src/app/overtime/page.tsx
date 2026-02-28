import { requireRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { OvertimeDashboard } from './overtime-dashboard';
import { getWeeklyOvertimeReport } from './actions';
import { db } from '@/db';
import { locations, managerLocations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { AppNav } from '@/components/app-nav';
import { getMyNotifications } from '@/app/notifications/actions';

export default async function OvertimePage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; week?: string }>;
}) {
  const user = await requireRole('MANAGER', 'ADMIN').catch(() => null);

  if (!user) {
    redirect('/login');
  }

  const params = await searchParams;

  // Get locations for this manager
  let userLocations;
  if (user.role === 'ADMIN') {
    userLocations = await db.select().from(locations);
  } else {
    const managerLocs = await db
      .select({ location: locations })
      .from(managerLocations)
      .innerJoin(locations, eq(managerLocations.locationId, locations.id))
      .where(eq(managerLocations.managerId, user.id));

    userLocations = managerLocs.map((ml) => ml.location);
  }

  if (userLocations.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-600">No locations assigned</p>
      </div>
    );
  }

  // Get selected location (default to first)
  const selectedLocationId =
    params.location || userLocations[0].id;
  const selectedLocation = userLocations.find((l) => l.id === selectedLocationId) || userLocations[0];

  // Get week start (default to current week)
  let weekStart: Date;
  if (params.week) {
    weekStart = new Date(params.week + 'T00:00:00');
  } else {
    const today = new Date();
    const dayOfWeek = today.getDay();
    weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
  }

  // Fetch overtime report and notifications
  const [overtimeReport, notifications] = await Promise.all([
    getWeeklyOvertimeReport(selectedLocation.id, weekStart),
    getMyNotifications(),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav
        userName={user.name}
        userRole={user.role}
        notifications={notifications}
        userId={user.id}
        title="Overtime Dashboard"
      />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <OvertimeDashboard
          locations={userLocations}
          selectedLocation={selectedLocation}
          weekStart={weekStart}
          overtimeReport={overtimeReport}
        />
      </div>
    </div>
  );
}
