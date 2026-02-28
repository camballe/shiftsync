import { config } from 'dotenv';

// Load env vars FIRST
config({ path: '.env.local' });

const DEFAULT_PASSWORD = 'shiftsync2026'; // Change this!

async function createAuthUsers() {
  // Dynamic imports after env is loaded
  const { createClient } = await import('@supabase/supabase-js');
  const { db } = await import('./index.js');
  const { users } = await import('./schema.js');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
    console.log('\nTo get your service role key:');
    console.log('1. Go to Supabase Dashboard → Project Settings → API');
    console.log('2. Copy the "service_role" key (NOT the anon key)');
    console.log('3. Add to .env.local as: SUPABASE_SERVICE_ROLE_KEY=your_key_here\n');
    process.exit(1);
  }

  // Use service role key to create users (bypasses auth restrictions)
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log('🔐 Creating Supabase Auth users for seeded data...\n');

  const dbUsers = await db.select().from(users);

  for (const user of dbUsers) {
    console.log(`Creating auth user for: ${user.email} (${user.role})`);

    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: DEFAULT_PASSWORD,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        name: user.name,
      },
    });

    if (error) {
      if (error.message.includes('already been registered')) {
        console.log(`  ⚠️  Already exists, skipping...`);
      } else {
        console.error(`  ❌ Error: ${error.message}`);
      }
    } else {
      console.log(`  ✓ Created with ID: ${data.user.id}`);

      // Update the authId in our database to match the Supabase Auth ID
      const { eq } = await import('drizzle-orm');
      await db.update(users)
        .set({ authId: data.user.id })
        .where(eq(users.id, user.id));

      console.log(`  ✓ Updated database auth_id mapping`);
    }
  }

  console.log(`\n✅ Done! All users created with password: ${DEFAULT_PASSWORD}`);
  console.log('\n📋 Login credentials:');
  console.log('   Admin:   admin@shiftsync.com');
  console.log('   Manager: sarah.manager@shiftsync.com');
  console.log('   Staff:   alex.staff@shiftsync.com');
  console.log(`   Password: ${DEFAULT_PASSWORD} (for all users)\n`);

  process.exit(0);
}

createAuthUsers().catch((error) => {
  console.error('❌ Failed:', error);
  process.exit(1);
});
