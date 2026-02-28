import { getUser } from '@/lib/auth';
import { db } from '@/db';
import { locations, managerLocations, shifts, shiftAssignments, users as usersTable, skills } from '@/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { WeeklyCalendar } from './weekly-calendar';
import { AppNav } from '@/components/app-nav';
import { getMyNotifications } from '@/app/notifications/actions';
import { formatDateLocal } from '@/lib/date-utils';

interface PageProps {
  params: Promise<{ locationId: string }>;
  searchParams: Promise<{ week?: string }>;
}

export default async function LocationSchedulePage({ params, searchParams }: PageProps) {
  const user = await getUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role !== 'MANAGER' && user.role !== 'ADMIN') {
    redirect('/dashboard');
  }
  const { locationId } = await params;
  const { week } = await searchParams;

  // Get locations this manager can access
  const accessibleLocations = user.role === 'ADMIN'
    ? await db.select().from(locations)
    : await db
        .select({ location: locations })
        .from(managerLocations)
        .innerJoin(locations, eq(managerLocations.locationId, locations.id))
        .where(eq(managerLocations.managerId, user.id))
        .then(rows => rows.map(r => r.location));

  const selectedLocation = accessibleLocations.find(l => l.id === locationId);

  if (!selectedLocation) {
    notFound();
  }

  // Parse week or default to current week
  const weekStart = week ? new Date(week + 'T00:00:00') : getWeekStart(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // Fetch shifts for the week
  const weekShiftsData = await db
    .select({
      shift: shifts,
      skill: skills,
      assignment: shiftAssignments,
      staff: usersTable,
    })
    .from(shifts)
    .leftJoin(skills, eq(shifts.skillId, skills.id))
    .leftJoin(shiftAssignments, eq(shifts.id, shiftAssignments.shiftId))
    .leftJoin(usersTable, eq(shiftAssignments.staffId, usersTable.id))
    .where(
      and(
        eq(shifts.locationId, locationId),
        gte(shifts.date, formatDateLocal(weekStart)),
        lte(shifts.date, formatDateLocal(weekEnd))
      )
    );

  // Group shifts by shift ID
  const shiftsMap = new Map();
  weekShiftsData.forEach(row => {
    if (!shiftsMap.has(row.shift.id)) {
      shiftsMap.set(row.shift.id, {
        ...row.shift,
        skill: row.skill,
        assignments: [],
      });
    }
    if (row.assignment && row.staff) {
      shiftsMap.get(row.shift.id).assignments.push({
        assignment: row.assignment,
        staff: row.staff,
      });
    }
  });

  const weekShifts = Array.from(shiftsMap.values());

  // Fetch notifications for the current user
  const notifications = await getMyNotifications();

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav
        userName={user.name}
        userRole={user.role}
        notifications={notifications}
        userId={user.id}
        title={selectedLocation.name}
        backHref="/dashboard"
        backLabel="Dashboard"
      />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <WeeklyCalendar
          locations={accessibleLocations}
          selectedLocation={selectedLocation}
          weekStart={weekStart}
          shifts={weekShifts}
          timezone={selectedLocation.timezone}
        />
      </main>
    </div>
  );
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  return d;
}
