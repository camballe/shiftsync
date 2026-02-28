import { requireAuth } from '@/lib/auth';
import { SwapRequestsList } from './swap-requests-list';
import { getSwapRequestsForManager, getMySwapRequests, getIncomingSwapRequests } from './actions';
import { AppNav } from '@/components/app-nav';
import { getMyNotifications } from '@/app/notifications/actions';

export default async function SwapRequestsPage() {
  const user = await requireAuth();

  const isManagerOrAdmin = user.role === 'MANAGER' || user.role === 'ADMIN';

  const [swapRequests, notifications, incomingRequests] = await Promise.all([
    isManagerOrAdmin ? getSwapRequestsForManager() : getMySwapRequests(),
    getMyNotifications(),
    !isManagerOrAdmin ? getIncomingSwapRequests() : Promise.resolve([]),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav
        userName={user.name}
        userRole={user.role}
        notifications={notifications}
        userId={user.id}
        title="Swap Requests"
      />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <SwapRequestsList
          requests={swapRequests}
          incomingRequests={incomingRequests}
          userRole={user.role}
          userId={user.id}
        />
      </div>
    </div>
  );
}
