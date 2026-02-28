import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { randomUUID } from 'crypto';
import { formatDateLocal } from '@/lib/date-utils';

// Load env vars FIRST
config({ path: '.env.local' });

// Create db client after env is loaded
const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
});
const db = drizzle(client, { schema });

async function seed() {
  console.log('🌱 Seeding database...');

  // Clear existing data (in reverse order of dependencies)
  await db.delete(schema.auditLogs);
  await db.delete(schema.notifications);
  await db.delete(schema.swapRequests);
  await db.delete(schema.shiftAssignments);
  await db.delete(schema.shifts);
  await db.delete(schema.availabilityExceptions);
  await db.delete(schema.availabilityRules);
  await db.delete(schema.staffLocationCerts);
  await db.delete(schema.staffSkills);
  await db.delete(schema.skills);
  await db.delete(schema.managerLocations);
  await db.delete(schema.locations);
  await db.delete(schema.users);

  console.log('✓ Cleared existing data');

  // Create fake auth IDs (in production, these would come from Supabase Auth)
  const authIds = {
    admin: randomUUID(),
    manager1: randomUUID(),
    manager2: randomUUID(),
    manager3: randomUUID(),
    staff1: randomUUID(),
    staff2: randomUUID(),
    staff3: randomUUID(),
    staff4: randomUUID(),
    staff5: randomUUID(),
    staff6: randomUUID(),
    staff7: randomUUID(),
    staff8: randomUUID(),
    staff9: randomUUID(),
    staff10: randomUUID(),
    staff11: randomUUID(),
    staff12: randomUUID(),
  };

  // 1. Create Users
  await db
    .insert(schema.users)
    .values({
      authId: authIds.admin,
      email: 'admin@shiftsync.com',
      name: 'Admin User',
      role: 'ADMIN',
    })
    .returning();

  const [manager1] = await db
    .insert(schema.users)
    .values({
      authId: authIds.manager1,
      email: 'sarah.manager@shiftsync.com',
      name: 'Sarah Johnson',
      role: 'MANAGER',
    })
    .returning();

  const [manager2] = await db
    .insert(schema.users)
    .values({
      authId: authIds.manager2,
      email: 'mike.manager@shiftsync.com',
      name: 'Mike Chen',
      role: 'MANAGER',
    })
    .returning();

  const [manager3] = await db
    .insert(schema.users)
    .values({
      authId: authIds.manager3,
      email: 'lisa.manager@shiftsync.com',
      name: 'Lisa Martinez',
      role: 'MANAGER',
    })
    .returning();

  // Staff members with varied backgrounds
  const [staff1] = await db
    .insert(schema.users)
    .values({
      authId: authIds.staff1,
      email: 'alex.staff@shiftsync.com',
      name: 'Alex Rivera',
      role: 'STAFF',
    })
    .returning();

  const [staff2] = await db
    .insert(schema.users)
    .values({
      authId: authIds.staff2,
      email: 'jordan.staff@shiftsync.com',
      name: 'Jordan Smith',
      role: 'STAFF',
    })
    .returning();

  const [staff3] = await db
    .insert(schema.users)
    .values({
      authId: authIds.staff3,
      email: 'taylor.staff@shiftsync.com',
      name: 'Taylor Brown',
      role: 'STAFF',
    })
    .returning();

  const [staff4] = await db
    .insert(schema.users)
    .values({
      authId: authIds.staff4,
      email: 'morgan.staff@shiftsync.com',
      name: 'Morgan Lee',
      role: 'STAFF',
    })
    .returning();

  const [staff5] = await db
    .insert(schema.users)
    .values({
      authId: authIds.staff5,
      email: 'casey.staff@shiftsync.com',
      name: 'Casey Davis',
      role: 'STAFF',
    })
    .returning();

  const [staff6] = await db
    .insert(schema.users)
    .values({
      authId: authIds.staff6,
      email: 'riley.staff@shiftsync.com',
      name: 'Riley Wilson',
      role: 'STAFF',
    })
    .returning();

  const [staff7] = await db
    .insert(schema.users)
    .values({
      authId: authIds.staff7,
      email: 'avery.staff@shiftsync.com',
      name: 'Avery Taylor',
      role: 'STAFF',
    })
    .returning();

  const [staff8] = await db
    .insert(schema.users)
    .values({
      authId: authIds.staff8,
      email: 'quinn.staff@shiftsync.com',
      name: 'Quinn Anderson',
      role: 'STAFF',
    })
    .returning();

  const [staff9] = await db
    .insert(schema.users)
    .values({
      authId: authIds.staff9,
      email: 'drew.staff@shiftsync.com',
      name: 'Drew Martinez',
      role: 'STAFF',
    })
    .returning();

  const [staff10] = await db
    .insert(schema.users)
    .values({
      authId: authIds.staff10,
      email: 'sage.staff@shiftsync.com',
      name: 'Sage Thompson',
      role: 'STAFF',
    })
    .returning();

  const [staff11] = await db
    .insert(schema.users)
    .values({
      authId: authIds.staff11,
      email: 'reese.staff@shiftsync.com',
      name: 'Reese Garcia',
      role: 'STAFF',
    })
    .returning();

  const [staff12] = await db
    .insert(schema.users)
    .values({
      authId: authIds.staff12,
      email: 'charlie.staff@shiftsync.com',
      name: 'Charlie Moore',
      role: 'STAFF',
    })
    .returning();

  console.log('✓ Created users (1 admin, 3 managers, 12 staff)');

  // 2. Create Locations (4 locations, 2 timezones)
  const [nyLocation] = await db
    .insert(schema.locations)
    .values({
      name: 'New York Store',
      timezone: 'America/New_York',
      address: '123 Broadway, New York, NY 10001',
    })
    .returning();

  const [bostonLocation] = await db
    .insert(schema.locations)
    .values({
      name: 'Boston Store',
      timezone: 'America/New_York',
      address: '456 Boylston St, Boston, MA 02116',
    })
    .returning();

  const [laLocation] = await db
    .insert(schema.locations)
    .values({
      name: 'Los Angeles Store',
      timezone: 'America/Los_Angeles',
      address: '789 Sunset Blvd, Los Angeles, CA 90028',
    })
    .returning();

  const [seattleLocation] = await db
    .insert(schema.locations)
    .values({
      name: 'Seattle Store',
      timezone: 'America/Los_Angeles',
      address: '321 Pike St, Seattle, WA 98101',
    })
    .returning();

  console.log('✓ Created 4 locations (2 EST, 2 PST)');

  // 3. Assign Managers to Locations
  // Sarah manages NY and Boston (multi-location manager - edge case)
  await db.insert(schema.managerLocations).values([
    { managerId: manager1.id, locationId: nyLocation.id },
    { managerId: manager1.id, locationId: bostonLocation.id },
  ]);

  // Mike manages LA
  await db.insert(schema.managerLocations).values({
    managerId: manager2.id,
    locationId: laLocation.id,
  });

  // Lisa manages Seattle
  await db.insert(schema.managerLocations).values({
    managerId: manager3.id,
    locationId: seattleLocation.id,
  });

  console.log('✓ Assigned managers to locations');

  // 4. Create Skills
  const [baristaSkill] = await db
    .insert(schema.skills)
    .values({
      name: 'Barista',
      description: 'Coffee preparation and beverage making',
    })
    .returning();

  const [cashierSkill] = await db
    .insert(schema.skills)
    .values({
      name: 'Cashier',
      description: 'Register operation and customer checkout',
    })
    .returning();

  const [openerSkill] = await db
    .insert(schema.skills)
    .values({
      name: 'Opener',
      description: 'Opening procedures and setup',
    })
    .returning();

  const [closerSkill] = await db
    .insert(schema.skills)
    .values({
      name: 'Closer',
      description: 'Closing procedures and cleanup',
    })
    .returning();

  const [supervisorSkill] = await db
    .insert(schema.skills)
    .values({
      name: 'Supervisor',
      description: 'Team leadership and oversight',
    })
    .returning();

  console.log('✓ Created 5 skills');

  // 5. Assign Skills to Staff (varied skill sets)
  await db.insert(schema.staffSkills).values([
    // Alex: Multi-skilled (barista, cashier, supervisor)
    { staffId: staff1.id, skillId: baristaSkill.id },
    { staffId: staff1.id, skillId: cashierSkill.id },
    { staffId: staff1.id, skillId: supervisorSkill.id },

    // Jordan: Barista and cashier
    { staffId: staff2.id, skillId: baristaSkill.id },
    { staffId: staff2.id, skillId: cashierSkill.id },

    // Taylor: Opener specialist
    { staffId: staff3.id, skillId: baristaSkill.id },
    { staffId: staff3.id, skillId: openerSkill.id },

    // Morgan: Closer specialist
    { staffId: staff4.id, skillId: cashierSkill.id },
    { staffId: staff4.id, skillId: closerSkill.id },

    // Casey: Cashier only (limited skills - edge case)
    { staffId: staff5.id, skillId: cashierSkill.id },

    // Riley: All-rounder
    { staffId: staff6.id, skillId: baristaSkill.id },
    { staffId: staff6.id, skillId: cashierSkill.id },
    { staffId: staff6.id, skillId: openerSkill.id },
    { staffId: staff6.id, skillId: closerSkill.id },

    // Avery: Barista specialist
    { staffId: staff7.id, skillId: baristaSkill.id },

    // Quinn: Barista and opener
    { staffId: staff8.id, skillId: baristaSkill.id },
    { staffId: staff8.id, skillId: openerSkill.id },

    // Drew: Cashier and closer
    { staffId: staff9.id, skillId: cashierSkill.id },
    { staffId: staff9.id, skillId: closerSkill.id },

    // Sage: Supervisor and barista
    { staffId: staff10.id, skillId: baristaSkill.id },
    { staffId: staff10.id, skillId: supervisorSkill.id },

    // Reese: Barista and cashier
    { staffId: staff11.id, skillId: baristaSkill.id },
    { staffId: staff11.id, skillId: cashierSkill.id },

    // Charlie: Cashier and opener
    { staffId: staff12.id, skillId: cashierSkill.id },
    { staffId: staff12.id, skillId: openerSkill.id },
  ]);

  console.log('✓ Assigned skills to staff');

  // 6. Create Location Certifications (varied patterns)
  await db.insert(schema.staffLocationCerts).values([
    // Alex: Certified for all locations (cross-timezone worker - edge case)
    { staffId: staff1.id, locationId: nyLocation.id },
    { staffId: staff1.id, locationId: bostonLocation.id },
    { staffId: staff1.id, locationId: laLocation.id },
    { staffId: staff1.id, locationId: seattleLocation.id },

    // Jordan: NY and Boston only (EST timezone only)
    { staffId: staff2.id, locationId: nyLocation.id },
    { staffId: staff2.id, locationId: bostonLocation.id },

    // Taylor: NY only (single location - edge case)
    { staffId: staff3.id, locationId: nyLocation.id },

    // Morgan: LA and Seattle (PST timezone only)
    { staffId: staff4.id, locationId: laLocation.id },
    { staffId: staff4.id, locationId: seattleLocation.id },

    // Casey: Boston only
    { staffId: staff5.id, locationId: bostonLocation.id },

    // Riley: LA and Seattle
    { staffId: staff6.id, locationId: laLocation.id },
    { staffId: staff6.id, locationId: seattleLocation.id },

    // Avery: All locations
    { staffId: staff7.id, locationId: nyLocation.id },
    { staffId: staff7.id, locationId: bostonLocation.id },
    { staffId: staff7.id, locationId: laLocation.id },
    { staffId: staff7.id, locationId: seattleLocation.id },

    // Quinn: NY and LA (cross-timezone)
    { staffId: staff8.id, locationId: nyLocation.id },
    { staffId: staff8.id, locationId: laLocation.id },

    // Drew: Seattle only
    { staffId: staff9.id, locationId: seattleLocation.id },

    // Sage: Boston and LA (cross-timezone)
    { staffId: staff10.id, locationId: bostonLocation.id },
    { staffId: staff10.id, locationId: laLocation.id },

    // Reese: NY and Boston
    { staffId: staff11.id, locationId: nyLocation.id },
    { staffId: staff11.id, locationId: bostonLocation.id },

    // Charlie: LA only
    { staffId: staff12.id, locationId: laLocation.id },
  ]);

  console.log('✓ Created location certifications');

  // 7. Create Availability Rules (recurring weekly patterns)
  await db.insert(schema.availabilityRules).values([
    // Alex: Full-time, Mon-Fri 9-5
    { staffId: staff1.id, dayOfWeek: 'MON', startTime: '09:00', endTime: '17:00' },
    { staffId: staff1.id, dayOfWeek: 'TUE', startTime: '09:00', endTime: '17:00' },
    { staffId: staff1.id, dayOfWeek: 'WED', startTime: '09:00', endTime: '17:00' },
    { staffId: staff1.id, dayOfWeek: 'THU', startTime: '09:00', endTime: '17:00' },
    { staffId: staff1.id, dayOfWeek: 'FRI', startTime: '09:00', endTime: '17:00' },

    // Jordan: Part-time, evenings only
    { staffId: staff2.id, dayOfWeek: 'MON', startTime: '17:00', endTime: '22:00' },
    { staffId: staff2.id, dayOfWeek: 'TUE', startTime: '17:00', endTime: '22:00' },
    { staffId: staff2.id, dayOfWeek: 'WED', startTime: '17:00', endTime: '22:00' },
    { staffId: staff2.id, dayOfWeek: 'THU', startTime: '17:00', endTime: '22:00' },

    // Taylor: Early mornings only (opener)
    { staffId: staff3.id, dayOfWeek: 'MON', startTime: '06:00', endTime: '12:00' },
    { staffId: staff3.id, dayOfWeek: 'TUE', startTime: '06:00', endTime: '12:00' },
    { staffId: staff3.id, dayOfWeek: 'WED', startTime: '06:00', endTime: '12:00' },
    { staffId: staff3.id, dayOfWeek: 'THU', startTime: '06:00', endTime: '12:00' },
    { staffId: staff3.id, dayOfWeek: 'FRI', startTime: '06:00', endTime: '12:00' },

    // Morgan: Weekends only
    { staffId: staff4.id, dayOfWeek: 'SAT', startTime: '08:00', endTime: '20:00' },
    { staffId: staff4.id, dayOfWeek: 'SUN', startTime: '08:00', endTime: '20:00' },

    // Casey: Limited availability (part-time student - edge case)
    { staffId: staff5.id, dayOfWeek: 'SAT', startTime: '10:00', endTime: '18:00' },
    { staffId: staff5.id, dayOfWeek: 'SUN', startTime: '10:00', endTime: '18:00' },

    // Riley: Full availability (all week, long hours)
    { staffId: staff6.id, dayOfWeek: 'MON', startTime: '06:00', endTime: '22:00' },
    { staffId: staff6.id, dayOfWeek: 'TUE', startTime: '06:00', endTime: '22:00' },
    { staffId: staff6.id, dayOfWeek: 'WED', startTime: '06:00', endTime: '22:00' },
    { staffId: staff6.id, dayOfWeek: 'THU', startTime: '06:00', endTime: '22:00' },
    { staffId: staff6.id, dayOfWeek: 'FRI', startTime: '06:00', endTime: '22:00' },
    { staffId: staff6.id, dayOfWeek: 'SAT', startTime: '06:00', endTime: '22:00' },
    { staffId: staff6.id, dayOfWeek: 'SUN', startTime: '06:00', endTime: '22:00' },

    // Avery: Mid-day shifts
    { staffId: staff7.id, dayOfWeek: 'TUE', startTime: '11:00', endTime: '19:00' },
    { staffId: staff7.id, dayOfWeek: 'WED', startTime: '11:00', endTime: '19:00' },
    { staffId: staff7.id, dayOfWeek: 'THU', startTime: '11:00', endTime: '19:00' },
    { staffId: staff7.id, dayOfWeek: 'FRI', startTime: '11:00', endTime: '19:00' },
    { staffId: staff7.id, dayOfWeek: 'SAT', startTime: '11:00', endTime: '19:00' },

    // Quinn: Early shifts Mon-Wed
    { staffId: staff8.id, dayOfWeek: 'MON', startTime: '06:00', endTime: '14:00' },
    { staffId: staff8.id, dayOfWeek: 'TUE', startTime: '06:00', endTime: '14:00' },
    { staffId: staff8.id, dayOfWeek: 'WED', startTime: '06:00', endTime: '14:00' },

    // Drew: Evenings Thu-Sun
    { staffId: staff9.id, dayOfWeek: 'THU', startTime: '16:00', endTime: '23:00' },
    { staffId: staff9.id, dayOfWeek: 'FRI', startTime: '16:00', endTime: '23:00' },
    { staffId: staff9.id, dayOfWeek: 'SAT', startTime: '16:00', endTime: '23:00' },
    { staffId: staff9.id, dayOfWeek: 'SUN', startTime: '16:00', endTime: '23:00' },

    // Sage: Full-time, flexible
    { staffId: staff10.id, dayOfWeek: 'MON', startTime: '08:00', endTime: '18:00' },
    { staffId: staff10.id, dayOfWeek: 'TUE', startTime: '08:00', endTime: '18:00' },
    { staffId: staff10.id, dayOfWeek: 'WED', startTime: '08:00', endTime: '18:00' },
    { staffId: staff10.id, dayOfWeek: 'THU', startTime: '08:00', endTime: '18:00' },
    { staffId: staff10.id, dayOfWeek: 'FRI', startTime: '08:00', endTime: '18:00' },

    // Reese: Alternating days
    { staffId: staff11.id, dayOfWeek: 'MON', startTime: '12:00', endTime: '20:00' },
    { staffId: staff11.id, dayOfWeek: 'WED', startTime: '12:00', endTime: '20:00' },
    { staffId: staff11.id, dayOfWeek: 'FRI', startTime: '12:00', endTime: '20:00' },

    // Charlie: Mornings only
    { staffId: staff12.id, dayOfWeek: 'MON', startTime: '07:00', endTime: '13:00' },
    { staffId: staff12.id, dayOfWeek: 'TUE', startTime: '07:00', endTime: '13:00' },
    { staffId: staff12.id, dayOfWeek: 'WED', startTime: '07:00', endTime: '13:00' },
    { staffId: staff12.id, dayOfWeek: 'THU', startTime: '07:00', endTime: '13:00' },
    { staffId: staff12.id, dayOfWeek: 'FRI', startTime: '07:00', endTime: '13:00' },
  ]);

  console.log('✓ Created availability rules');

  // 8. Create Availability Exceptions (specific date overrides - edge cases)
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  const nextMonth = new Date(today);
  nextMonth.setDate(today.getDate() + 30);

  await db.insert(schema.availabilityExceptions).values([
    // Alex: Unavailable next week Monday (vacation)
    {
      staffId: staff1.id,
      date: new Date(nextWeek.setDate(nextWeek.getDate() - nextWeek.getDay() + 1))
        .toISOString()
        .split('T')[0],
      isAvailable: false,
      reason: 'Vacation day',
    },

    // Jordan: Available extra hours on a specific Saturday (override weekend unavailability)
    {
      staffId: staff2.id,
      date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + ((6 - today.getDay() + 7) % 7))
        .toISOString()
        .split('T')[0],
      isAvailable: true,
      startTime: '10:00',
      endTime: '18:00',
      reason: 'Available for extra shift',
    },

    // Taylor: Unavailable next month (longer leave - edge case)
    {
      staffId: staff3.id,
      date: formatDateLocal(nextMonth),
      isAvailable: false,
      reason: 'Medical appointment',
    },

    // Casey: Available on a Friday (normally not available)
    {
      staffId: staff5.id,
      date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + ((5 - today.getDay() + 7) % 7))
        .toISOString()
        .split('T')[0],
      isAvailable: true,
      startTime: '14:00',
      endTime: '20:00',
      reason: 'Can cover extra shift',
    },
  ]);

  console.log('✓ Created availability exceptions');

  // 9. Create some initial shifts (unpublished and published)
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(today.getDate() + 2);
  const threeDays = new Date(today);
  threeDays.setDate(today.getDate() + 3);

  await db
    .insert(schema.shifts)
    .values({
      locationId: nyLocation.id,
      date: formatDateLocal(tomorrow),
      startTime: '09:00',
      endTime: '17:00',
      skillId: baristaSkill.id,
      headcount: 2,
      isPublished: false,
      createdBy: manager1.id,
    })
    .returning();

  const [shift2] = await db
    .insert(schema.shifts)
    .values({
      locationId: nyLocation.id,
      date: formatDateLocal(tomorrow),
      startTime: '14:00',
      endTime: '22:00',
      skillId: cashierSkill.id,
      headcount: 1,
      isPublished: true,
      publishedAt: new Date(),
      createdBy: manager1.id,
    })
    .returning();

  const [shift3] = await db
    .insert(schema.shifts)
    .values({
      locationId: bostonLocation.id,
      date: formatDateLocal(dayAfter),
      startTime: '06:00',
      endTime: '14:00',
      skillId: openerSkill.id,
      headcount: 1,
      isPublished: true,
      publishedAt: new Date(),
      createdBy: manager1.id,
    })
    .returning();

  await db
    .insert(schema.shifts)
    .values({
      locationId: laLocation.id,
      date: formatDateLocal(threeDays),
      startTime: '10:00',
      endTime: '18:00',
      skillId: baristaSkill.id,
      headcount: 3,
      isPublished: false,
      createdBy: manager2.id,
    })
    .returning();

  const [shift5] = await db
    .insert(schema.shifts)
    .values({
      locationId: seattleLocation.id,
      date: formatDateLocal(threeDays),
      startTime: '16:00',
      endTime: '23:00',
      skillId: closerSkill.id,
      headcount: 1,
      isPublished: true,
      publishedAt: new Date(),
      createdBy: manager3.id,
    })
    .returning();

  console.log('✓ Created 5 initial shifts');

  // 10. Create some shift assignments
  await db.insert(schema.shiftAssignments).values([
    // Shift 2 has Jordan assigned
    { shiftId: shift2.id, staffId: staff2.id, assignedBy: manager1.id },

    // Shift 3 has Taylor assigned (opener)
    { shiftId: shift3.id, staffId: staff3.id, assignedBy: manager1.id },

    // Shift 5 has Morgan assigned (closer)
    { shiftId: shift5.id, staffId: staff4.id, assignedBy: manager3.id },
  ]);

  console.log('✓ Created initial shift assignments');

  console.log('\n✅ Seed completed successfully!\n');
  console.log('📋 Summary:');
  console.log('   - 1 Admin, 3 Managers, 12 Staff');
  console.log('   - 4 Locations (NY, Boston, LA, Seattle)');
  console.log('   - 5 Skills with varied assignments');
  console.log('   - Multiple location certifications (including cross-timezone)');
  console.log('   - Availability rules and exceptions');
  console.log('   - 5 shifts (some published, some not)');
  console.log('   - 3 shift assignments');
  console.log('\n🔑 Login Credentials:');
  console.log('   Admin:    admin@shiftsync.com');
  console.log('   Manager:  sarah.manager@shiftsync.com (manages NY + Boston)');
  console.log('   Manager:  mike.manager@shiftsync.com (manages LA)');
  console.log('   Manager:  lisa.manager@shiftsync.com (manages Seattle)');
  console.log('   Staff:    alex.staff@shiftsync.com (multi-location, multi-skilled)');
  console.log('   Staff:    jordan.staff@shiftsync.com (evenings, EST only)');
  console.log('   Staff:    taylor.staff@shiftsync.com (opener, NY only)');
  console.log('   ... and 9 more staff members');
  console.log('\n💡 Note: Auth IDs generated. You\'ll need to create corresponding Supabase Auth users.');

  process.exit(0);
}

seed().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
