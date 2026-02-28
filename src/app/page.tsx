import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const user = await getUser();

  // If logged in, redirect to dashboard
  if (user) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white">
      <div className="text-center space-y-8 px-4">
        <h1 className="text-6xl font-bold tracking-tight text-gray-900">
          ShiftSync
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl">
          Multi-location shift scheduling platform for teams across timezones
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-white px-6 py-3 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
