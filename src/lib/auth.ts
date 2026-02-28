import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { cache } from 'react';

export type Role = 'ADMIN' | 'MANAGER' | 'STAFF';

export interface AuthUser {
  id: string;
  authId: string;
  email: string;
  name: string;
  role: Role;
}

/**
 * Get the current authenticated user with their role from the database.
 * Cached per request to avoid multiple database queries.
 */
export const getUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return null;
  }

  // Get user data from our database
  const [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.authId, authUser.id))
    .limit(1);

  if (!dbUser) {
    return null;
  }

  return {
    id: dbUser.id,
    authId: dbUser.authId,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role as Role,
  };
});

/**
 * Require authentication. Throws error if not authenticated.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  return user;
}

/**
 * Require specific role(s). Throws error if user doesn't have required role.
 */
export async function requireRole(...roles: Role[]): Promise<AuthUser> {
  const user = await requireAuth();

  if (!roles.includes(user.role)) {
    throw new Error(`Forbidden: Requires role ${roles.join(' or ')}`);
  }

  return user;
}

/**
 * Check if user has specific role
 */
export async function hasRole(role: Role): Promise<boolean> {
  const user = await getUser();
  return user?.role === role;
}

/**
 * Check if user is admin
 */
export async function isAdmin(): Promise<boolean> {
  return hasRole('ADMIN');
}

/**
 * Check if user is manager
 */
export async function isManager(): Promise<boolean> {
  return hasRole('MANAGER');
}

/**
 * Check if user is staff
 */
export async function isStaff(): Promise<boolean> {
  return hasRole('STAFF');
}
