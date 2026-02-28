import { requireRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { FairnessDashboard } from './fairness-dashboard';
import { getFairnessReport } from './actions';
import { db } from '@/db';
import { locations, managerLocations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { AppNav } from '@/components/app-nav';
import { getMyNotifications } from '@/app/notifications/actions';

export default async function FairnessPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; startDate?: string; endDate?: string }>;
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

  // Get date range (default to last 30 days)
  const endDate = params.endDate
    ? new Date(params.endDate)
    : new Date();
  const startDate = params.startDate
    ? new Date(params.startDate)
    : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Fetch fairness report and notifications
  const [fairnessReport, notifications] = await Promise.all([
    getFairnessReport(selectedLocation.id, startDate, endDate),
    getMyNotifications(),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav
        userName={user.name}
        userRole={user.role}
        notifications={notifications}
        userId={user.id}
        title="Schedule Fairness"
      />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <FairnessDashboard
          locations={userLocations}
          selectedLocation={selectedLocation}
          startDate={startDate}
          endDate={endDate}
          fairnessReport={fairnessReport}
        />
      </div>
    </div>
  );
}
