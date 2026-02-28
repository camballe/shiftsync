import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { LoginForm } from './login-form';

export default async function LoginPage() {
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
          <p className="mt-2 text-sm text-gray-600">Sign in to your account</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
