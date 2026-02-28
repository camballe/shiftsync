import { getUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SettingsForm } from './settings-form';
import { getNotificationPreferences, getDesiredHours, getAvailabilityRules, getAvailabilityExceptions } from './actions';
import { AppNav } from '@/components/app-nav';
import { getMyNotifications } from '@/app/notifications/actions';

export default async function SettingsPage() {
  const user = await getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch preferences and notifications
  const [notificationPreferences, desiredHours, notifications, availabilityRules, availabilityExceptions] = await Promise.all([
    getNotificationPreferences(),
    getDesiredHours(),
    getMyNotifications(),
    user.role === 'STAFF' ? getAvailabilityRules() : Promise.resolve([]),
    user.role === 'STAFF' ? getAvailabilityExceptions() : Promise.resolve([]),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav
        userName={user.name}
        userRole={user.role}
        notifications={notifications}
        userId={user.id}
        title="Settings"
      />

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <SettingsForm
          initialPreferences={notificationPreferences}
          initialDesiredHours={desiredHours}
          userRole={user.role}
          initialAvailabilityRules={availabilityRules}
          initialAvailabilityExceptions={availabilityExceptions}
        />
      </div>
    </div>
  );
}
