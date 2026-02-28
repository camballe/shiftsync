import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { serverEnv } from '@/lib/env';

// Disable prefetch as it's not supported for "Transaction" pool mode
const client = postgres(serverEnv.DATABASE_URL, {
  prepare: false,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
});

export const db = drizzle(client, { schema });
