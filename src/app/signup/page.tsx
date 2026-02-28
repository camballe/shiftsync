import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { SignupForm } from './signup-form';

export default async function SignupPage() {
  // If already logged in, redirect to dashboard
  const user = await getUser();
  if (user) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">ShiftSync</h1>
          <p className="mt-2 text-sm text-gray-600">Create your account</p>
        </div>
        <SignupForm />
      </div>
    </div>
  );
}
