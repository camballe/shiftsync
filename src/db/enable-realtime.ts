import { config } from 'dotenv';
import postgres from 'postgres';

// Load env vars FIRST
config({ path: '.env.local' });

const REALTIME_TABLES = [
  'shifts',
  'shift_assignments',
  'swap_requests',
  'notifications',
];

async function enableRealtime() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required in .env.local');
  }

  const sql = postgres(databaseUrl, { prepare: false });

  console.log('Enabling Supabase Realtime on required tables...\n');

  try {
    for (const table of REALTIME_TABLES) {
      try {
        await sql.unsafe(
          `ALTER PUBLICATION supabase_realtime ADD TABLE "${table}"`
        );
        console.log(`  + Added "${table}" to supabase_realtime publication`);
      } catch (err: unknown) {
        if (err instanceof Error && err.message?.includes('already member')) {
          console.log(`  = "${table}" already in supabase_realtime publication`);
        } else {
          throw err;
        }
      }
    }

    console.log('');

    // Set REPLICA IDENTITY FULL so DELETE events include old row data
    for (const table of REALTIME_TABLES) {
      await sql.unsafe(`ALTER TABLE "${table}" REPLICA IDENTITY FULL`);
      console.log(`  + Set REPLICA IDENTITY FULL on "${table}"`);
    }

    console.log('\nRealtime enabled successfully.');
    console.log(
      'Tables now broadcasting changes:',
      REALTIME_TABLES.join(', ')
    );
  } finally {
    await sql.end();
  }
}

enableRealtime().catch((err) => {
  console.error('Failed to enable realtime:', err);
  process.exit(1);
});
