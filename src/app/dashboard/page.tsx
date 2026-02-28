import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { eq, and, gte, lte, count } from 'drizzle-orm';
import {
  managerLocations,
  locations,
  users,
  shifts,
  swapRequests,
} from '@/db/schema';
import { AppNav } from '@/components/app-nav';
import { getMyNotifications } from '@/app/notifications/actions';
import { formatDateLocal } from '@/lib/date-utils';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  const user = await requireAuth();

  // Redirect staff to my-shifts
  if (user.role === 'STAFF') {
    redirect('/my-shifts');
  }

  const today = new Date();
  const weekStart = getWeekStart(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // Get locations based on role
  const userLocations = user.role === 'ADMIN'
    ? await db.select().from(locations)
    : await db
        .select({ location: locations })
        .from(managerLocations)
        .innerJoin(locations, eq(managerLocations.locationId, locations.id))
        .where(eq(managerLocations.managerId, user.id))
        .then(rows => rows.map(r => r.location));

  const locationIds = userLocations.map(l => l.id);

  const [
    staffCount,
    managerCount,
    thisWeekShifts,
    pendingSwaps,
    notifications,
  ] = await Promise.all([
    user.role === 'ADMIN'
      ? db.select({ count: count() }).from(users).where(eq(users.role, 'STAFF')).then(r => r[0]?.count ?? 0)
      : Promise.resolve(0),
    user.role === 'ADMIN'
      ? db.select({ count: count() }).from(users).where(eq(users.role, 'MANAGER')).then(r => r[0]?.count ?? 0)
      : Promise.resolve(0),
    db
      .select({
        id: shifts.id,
        locationId: shifts.locationId,
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        headcount: shifts.headcount,
        isPublished: shifts.isPublished,
      })
      .from(shifts)
      .where(
        and(
          gte(shifts.date, formatDateLocal(weekStart)),
          lte(shifts.date, formatDateLocal(weekEnd))
        )
      ),
    db
      .select({ count: count() })
      .from(swapRequests)
      .where(eq(swapRequests.status, 'PENDING'))
      .then(r => r[0]?.count ?? 0),
    getMyNotifications(),
  ]);

  // Filter shifts to accessible locations for managers
  const filteredShifts = user.role === 'ADMIN'
    ? thisWeekShifts
    : thisWeekShifts.filter(s => locationIds.includes(s.locationId));

  const totalShiftsThisWeek = filteredShifts.length;
  const publishedShifts = filteredShifts.filter(s => s.isPublished).length;
  const unpublishedShifts = totalShiftsThisWeek - publishedShifts;

  // Shifts per location
  const shiftsByLocation = new Map<string, number>();
  for (const shift of filteredShifts) {
    shiftsByLocation.set(
      shift.locationId,
      (shiftsByLocation.get(shift.locationId) || 0) + 1
    );
  }

  const isAdmin = user.role === 'ADMIN';

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav
        userName={user.name}
        userRole={user.role}
        notifications={notifications}
        userId={user.id}
        title="Dashboard"
      />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Stats */}
        <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} mb-8`}>
          {isAdmin && (
            <StatCard
              label="Staff Members"
              value={staffCount}
              detail={`${managerCount} manager${managerCount !== 1 ? 's' : ''}`}
            />
          )}
          <StatCard
            label="Locations"
            value={userLocations.length}
            detail={isAdmin ? 'Across all regions' : 'You manage'}
          />
          <StatCard
            label="Shifts This Week"
            value={totalShiftsThisWeek}
            detail={`${publishedShifts} published, ${unpublishedShifts} draft`}
          />
          <StatCard
            label="Pending Swaps"
            value={pendingSwaps}
            detail="Awaiting review"
            highlight={pendingSwaps > 0}
          />
        </div>

        {/* Locations Overview */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {isAdmin ? 'All Locations' : 'Your Locations'}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {userLocations.map((loc) => (
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
                <p className="mt-2 text-sm text-blue-600">
                  {shiftsByLocation.get(loc.id) || 0} shifts this week
                </p>
              </Link>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <QuickAction
              href="/schedules"
              title="Schedules"
              description="View and manage shift schedules"
            />
            <QuickAction
              href="/swap-requests"
              title="Swap Requests"
              description={
                pendingSwaps > 0
                  ? `${pendingSwaps} pending request${pendingSwaps !== 1 ? 's' : ''} to review`
                  : 'No pending requests'
              }
            />
            <QuickAction
              href="/overtime"
              title="Overtime Tracker"
              description="Monitor weekly hours and overtime projections"
            />
            <QuickAction
              href="/fairness"
              title="Fairness Analytics"
              description="Review shift distribution and fairness scores"
            />
            <QuickAction
              href="/on-duty"
              title="On-Duty Now"
              description="See who is currently working at each location"
            />
            {isAdmin && (
              <QuickAction
                href="/audit"
                title="Audit Log"
                description="View all schedule changes and administrative actions"
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  highlight,
}: {
  label: string;
  value: number;
  detail: string;
  highlight?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
      <dt className="truncate text-sm font-medium text-gray-500">{label}</dt>
      <dd
        className={`mt-1 text-3xl font-semibold tracking-tight ${
          highlight ? 'text-amber-600' : 'text-gray-900'
        }`}
      >
        {value}
      </dd>
      <dd className="mt-1 text-sm text-gray-500">{detail}</dd>
    </div>
  );
}

function QuickAction({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg bg-white p-5 shadow hover:shadow-md transition-shadow"
    >
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </Link>
  );
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}
