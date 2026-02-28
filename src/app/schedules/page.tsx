import { getUser } from '@/lib/auth';
import { db } from '@/db';
import { locations, managerLocations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AppNav } from '@/components/app-nav';
import { getMyNotifications } from '@/app/notifications/actions';

export default async function SchedulesPage() {
  const user = await getUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role !== 'MANAGER' && user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  // Get locations this user can access
  const accessibleLocations = user.role === 'ADMIN'
    ? await db.select().from(locations)
    : await db
        .select({ location: locations })
        .from(managerLocations)
        .innerJoin(locations, eq(managerLocations.locationId, locations.id))
        .where(eq(managerLocations.managerId, user.id))
        .then(rows => rows.map(r => r.location));

  const notifications = await getMyNotifications();

  if (accessibleLocations.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppNav
          userName={user.name}
          userRole={user.role}
          notifications={notifications}
          userId={user.id}
          title="Schedules"
          backHref="/dashboard"
          backLabel="Dashboard"
        />
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-gray-600">You don&apos;t have access to any locations.</p>
        </main>
      </div>
    );
  }

  // If only one location, go directly to it
  if (accessibleLocations.length === 1) {
    redirect(`/schedules/${accessibleLocations[0].id}`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav
        userName={user.name}
        userRole={user.role}
        notifications={notifications}
        userId={user.id}
        title="Schedules"
        backHref="/dashboard"
        backLabel="Dashboard"
      />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Select a Location
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {accessibleLocations.map((loc) => (
            <Link
              key={loc.id}
              href={`/schedules/${loc.id}`}
              className="block rounded-lg bg-white p-5 shadow hover:shadow-md transition-shadow"
            >
              <h3 className="text-base font-semibold text-gray-900">
                {loc.name}
              </h3>
              {loc.address && (
                <p className="mt-1 text-sm text-gray-500">{loc.address}</p>
              )}
              <p className="mt-1 text-xs text-gray-400">
                Timezone: {loc.timezone}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
