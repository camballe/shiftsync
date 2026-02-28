import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  date,
  time,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';

// Enums
export const roleEnum = pgEnum('role', ['ADMIN', 'MANAGER', 'STAFF']);
export const swapTypeEnum = pgEnum('swap_type', ['SWAP', 'DROP']);
export const swapStatusEnum = pgEnum('swap_status', ['PENDING', 'APPROVED', 'DENIED', 'CANCELLED', 'ACCEPTED_BY_TARGET']);
export const dayOfWeekEnum = pgEnum('day_of_week', ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);

// Users table - linked to Supabase Auth
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  authId: uuid('auth_id').notNull().unique(), // Links to Supabase auth.users.id
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  role: roleEnum('role').notNull().default('STAFF'),
  desiredHours: integer('desired_hours'), // Desired weekly hours for staff (null for managers/admins)
  notificationPreferences: jsonb('notification_preferences').default({ inApp: true, email: false }), // Notification delivery preferences
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Locations table
export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  timezone: varchar('timezone', { length: 50 }).notNull(), // e.g., "America/New_York"
  address: text('address'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Manager-Location assignments (many-to-many)
export const managerLocations = pgTable('manager_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  managerId: uuid('manager_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  locationId: uuid('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Skills table
export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Staff skills (proficiency)
export const staffSkills = pgTable('staff_skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  staffId: uuid('staff_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  skillId: uuid('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Staff location certifications
export const staffLocationCerts = pgTable('staff_location_certs', {
  id: uuid('id').primaryKey().defaultRandom(),
  staffId: uuid('staff_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  locationId: uuid('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  certifiedAt: timestamp('certified_at').notNull().defaultNow(),
});

// Availability rules (recurring weekly patterns)
export const availabilityRules = pgTable('availability_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  staffId: uuid('staff_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  dayOfWeek: dayOfWeekEnum('day_of_week').notNull(),
  startTime: time('start_time').notNull(), // e.g., "09:00"
  endTime: time('end_time').notNull(), // e.g., "17:00"
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Availability exceptions (specific date overrides)
export const availabilityExceptions = pgTable('availability_exceptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  staffId: uuid('staff_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  isAvailable: boolean('is_available').notNull(), // true = available, false = unavailable
  startTime: time('start_time'), // null if unavailable all day
  endTime: time('end_time'),
  reason: text('reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Shifts table with optimistic locking
export const shifts = pgTable('shifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  locationId: uuid('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  skillId: uuid('skill_id').notNull().references(() => skills.id, { onDelete: 'restrict' }),
  headcount: integer('headcount').notNull().default(1), // Number of staff needed
  isPublished: boolean('is_published').notNull().default(false),
  publishedAt: timestamp('published_at'),
  version: integer('version').notNull().default(1), // Optimistic locking
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Shift assignments
export const shiftAssignments = pgTable('shift_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  shiftId: uuid('shift_id').notNull().references(() => shifts.id, { onDelete: 'cascade' }),
  staffId: uuid('staff_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignedBy: uuid('assigned_by').notNull().references(() => users.id),
  assignedAt: timestamp('assigned_at').notNull().defaultNow(),
});

// Swap requests
export const swapRequests = pgTable('swap_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  shiftAssignmentId: uuid('shift_assignment_id').notNull().references(() => shiftAssignments.id, { onDelete: 'cascade' }),
  requestedBy: uuid('requested_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: swapTypeEnum('type').notNull(), // SWAP or DROP
  targetStaffId: uuid('target_staff_id').references(() => users.id), // null for DROP, specific user for SWAP
  status: swapStatusEnum('status').notNull().default('PENDING'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  reviewNotes: text('review_notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Notifications (simulated email storage)
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 100 }).notNull(), // e.g., "SHIFT_ASSIGNED", "SWAP_APPROVED"
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  relatedEntityType: varchar('related_entity_type', { length: 50 }), // e.g., "shift", "swap_request"
  relatedEntityId: uuid('related_entity_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Audit logs
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: varchar('entity_type', { length: 50 }).notNull(), // e.g., "shift", "shift_assignment"
  entityId: uuid('entity_id').notNull(),
  action: varchar('action', { length: 50 }).notNull(), // e.g., "CREATE", "UPDATE", "DELETE"
  before: jsonb('before'), // State before change (null for CREATE)
  after: jsonb('after'), // State after change (null for DELETE)
  changedBy: uuid('changed_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
