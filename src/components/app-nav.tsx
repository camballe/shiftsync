'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { NotificationCenter } from './notification-center';
import type { Notification } from '@/app/notifications/actions';

interface AppNavProps {
  userName: string;
  userRole: string;
  notifications: Notification[];
  userId: string;
  title?: string;
  backHref?: string;
  backLabel?: string;
}

export function AppNav({
  userName,
  userRole,
  notifications,
  userId,
  title,
  backHref,
  backLabel,
}: AppNavProps) {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const navLinks = () => {
    if (userRole === 'STAFF') {
      return [
        { href: '/my-shifts', label: 'My Shifts' },
        { href: '/swap-requests', label: 'Swap Requests' },
      ];
    }
    const links = [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/schedules', label: 'Schedules' },
      { href: '/swap-requests', label: 'Swaps' },
      { href: '/overtime', label: 'Overtime' },
      { href: '/fairness', label: 'Fairness' },
      { href: '/on-duty', label: 'On-Duty' },
    ];
    if (userRole === 'ADMIN' || userRole === 'MANAGER') {
      links.push({ href: '/audit', label: 'Audit' });
    }
    return links;
  };

  const links = navLinks();

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 sm:h-16 justify-between items-center">
          {/* Left: Back link / Title */}
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            {backHref && backLabel && (
              <>
                <Link
                  href={backHref}
                  className="text-sm text-gray-600 hover:text-gray-900 shrink-0"
                >
                  ← <span className="hidden sm:inline">{backLabel}</span><span className="sm:hidden">Back</span>
                </Link>
                <div className="h-6 w-px bg-gray-300 hidden sm:block" />
              </>
            )}
            {title && (
              <h1 className="text-base sm:text-xl font-semibold text-gray-900 truncate">{title}</h1>
            )}
          </div>

          {/* Desktop nav links */}
          <div className="hidden lg:flex items-center gap-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap"
              >
                {link.label}
              </Link>
            ))}

            <div className="h-6 w-px bg-gray-300" />

            <NotificationCenter
              userId={userId}
              initialNotifications={notifications}
            />

            <Link
              href="/settings"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Settings
            </Link>

            <div className="text-sm text-gray-600 hidden xl:block">
              {userName} ({userRole})
            </div>

            <button
              onClick={handleSignOut}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>

          {/* Mobile: notification + hamburger */}
          <div className="flex items-center gap-2 lg:hidden">
            <NotificationCenter
              userId={userId}
              initialNotifications={notifications}
            />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-gray-200 bg-white">
          <div className="px-4 py-3 space-y-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/settings"
              onClick={() => setMobileMenuOpen(false)}
              className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            >
              Settings
            </Link>
          </div>
          <div className="border-t border-gray-200 px-4 py-3">
            <div className="text-sm text-gray-600 mb-2">
              {userName} ({userRole})
            </div>
            <button
              onClick={handleSignOut}
              className="w-full rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
