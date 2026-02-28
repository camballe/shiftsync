'use server';

import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users } from '@/db/schema';

export async function signupAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  try {
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!name || !email || !password) {
      return { success: false, error: 'All fields are required' };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data.user) {
      return { success: false, error: 'Failed to create account' };
    }

    // Create user record in our database
    await db.insert(users).values({
      authId: data.user.id,
      email,
      name,
    });

    return { success: true };
  } catch (error) {
    console.error('Signup error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
