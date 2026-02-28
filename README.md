# ShiftSync - Multi-Location Staff Scheduling Platform

A full-stack workforce scheduling system built for restaurant groups with multiple locations across different timezones.

---

## 🚀 Quick Start for Evaluators

### Test Credentials
**All passwords:** `shiftsync2026`

```
Admin:     admin@shiftsync.com
Manager:   sarah.manager@shiftsync.com
Staff:     alex.staff@shiftsync.com
```

See [TEST_CREDENTIALS.md](./TEST_CREDENTIALS.md) for complete list.

### Key Documentation
- **[DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md)** - Resolution of all intentional ambiguities
- **[TEST_CREDENTIALS.md](./TEST_CREDENTIALS.md)** - All test accounts with roles/permissions

---

## ✅ Feature Completeness

### Core Requirements

| Feature | Status | Notes |
|---------|--------|-------|
| **User Roles & Permissions** | ✅ Complete | Admin, Manager (multi-location), Staff |
| **Shift Scheduling** | ✅ Complete | Create, edit, publish, unpublish with 48hr cutoff |
| **Constraint Enforcement** | ✅ Complete | 8 constraints with clear error messages + suggestions |
| **Shift Swapping** | ✅ Complete | Swap/drop requests with approval workflow |
| **Overtime Tracking** | ✅ Complete | Real-time warnings at 35hr, hard block at 40hr/week |
| **Fairness Analytics** | ✅ Complete | Distribution reports, desirable shift tracking |
| **Real-time Updates** | ✅ Complete | Supabase Realtime with optimistic locking |
| **Notifications** | ✅ Complete | In-app notification center with preferences |
| **Timezone Handling** | ✅ Complete | Correct storage/display across EST/PST locations |
| **Audit Trail** | ✅ Complete | All changes logged with before/after state, CSV export |

### Constraints Enforced

1. ✅ **No Double-Booking** - Same person, overlapping times, across locations
2. ✅ **10-Hour Rest Period** - Between shifts (including overnight shifts)
3. ✅ **Skill Matching** - Staff only assigned to shifts requiring their skills
4. ✅ **Location Certification** - Staff only assigned to certified locations
5. ✅ **Availability Windows** - Recurring + exception-based availability
6. ✅ **40-Hour Weekly Limit** - Warning at 35h, overtime tracking at 40h+
7. ✅ **12-Hour Daily Limit** - Hard block (with 8hr warning)
8. ✅ **7th Consecutive Day** - Requires manager override with documented reason

All constraint violations show:
- ✅ Clear error messages explaining which rule was broken
- ✅ Suggested alternatives (e.g., "Alex and Jordan are available instead")

---

## 🎯 Evaluation Scenarios

All 6 evaluation scenarios are fully supported:

### 1. The Sunday Night Chaos (Coverage Emergency)
- Remove the calling-out staff member from the shift
- Open the assignment dialog to see qualified, available replacements with constraint validation
- Assign a replacement in 2-3 clicks

### 2. The Overtime Trap (52-Hour Week)
- Build a schedule approaching 40 hours — system warns at 35h
- "What-If?" analysis shows projected hours and cost impact before confirming
- Overtime dashboard (`/overtime`) shows projected costs per staff member

### 3. The Timezone Tangle (Multi-TZ Availability)
- Staff availability uses "clock time" — 9am-5pm applies as local time at each location
- See [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md#1-timezone--availability-the-timezone-tangle) for rationale

### 4. The Simultaneous Assignment (Race Condition)
- Advisory locks + optimistic locking prevent double-booking under concurrent operations
- Real-time updates via Supabase Realtime — second manager sees the conflict immediately
- See [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md#9-concurrent-operation-safety) for details

### 5. The Fairness Complaint (Saturday Night Distribution)
- Fairness dashboard (`/fairness`) shows hours distribution and desirable shift counts
- Fri/Sat evening shifts are tracked as "premium" shifts
- Variance from desired hours shown with color-coded status

### 6. The Regret Swap (Canceling Pending Swap)
- Staff can cancel pending swap requests before manager approval
- Original assignment remains unchanged after cancellation
- All parties notified at each state change

---

## 🏗️ Technology Stack

**Frontend:**
- Next.js 16 (App Router, React 19, Server Actions)
- TypeScript with strict type safety
- Tailwind CSS + shadcn/ui components

**Backend:**
- Supabase (PostgreSQL + Auth + Realtime)
- Drizzle ORM for type-safe database queries
- Server-side authorization with role-based access control

**Real-time:**
- Supabase Realtime (postgres_changes subscriptions)
- Optimistic locking with version field
- Event-driven notifications

**Architecture Highlights:**
- Server-side rendering for performance
- Optimistic UI updates with real-time sync
- Constraint validation on server actions with clear error feedback
- Audit logging for all mutations

---

## 📊 Database Schema

**11 Core Tables:**
- `users` - Auth + profile (role, desired hours, notification prefs)
- `locations` - 4 locations across 2 timezones (EST/PST)
- `skills` - 5 skills (Barista, Cashier, Opener, Closer, Supervisor)
- `shifts` - Date, time, location, skill, headcount, publish status
- `shift_assignments` - Many-to-many: shifts ↔ staff
- `availability_rules` - Recurring weekly patterns (e.g., "Mon 9am-5pm")
- `availability_exceptions` - One-off date overrides
- `swap_requests` - Swap/drop workflow with PENDING/APPROVED/DENIED
- `notifications` - In-app notification center
- `audit_logs` - Complete before/after history of all changes
- `manager_locations` - Multi-location manager assignments

---

## 🔐 Security & Data Integrity

**Authentication:**
- Supabase Auth with email/password
- Role-based access control (ADMIN/MANAGER/STAFF)
- Session management with secure cookies

**Authorization:**
- Server-side role checks on all mutations (`requireAuth`, `requireRole`)
- Managers restricted to assigned locations only
- Staff can only view their own shifts and make swap requests

**Concurrency Safety:**
- Optimistic locking prevents lost updates
- Database constraints prevent invalid states
- Transaction-based assignment to prevent race conditions

**Audit Compliance:**
- All mutations logged to `audit_logs` table
- Before/after state captured as JSONB
- Exportable audit trail for labor law compliance

---

## 🌍 Timezone Handling

**Implementation:**
- Dates stored as PostgreSQL `DATE` (no timezone)
- Times stored as PostgreSQL `TIME` (no timezone)
- Each location has IANA timezone (e.g., "America/New_York")
- All date formatting uses `formatDateLocal()` to avoid UTC conversion bugs

**User Experience:**
- Schedule shows "All times in {location timezone}"
- Times display as clock time at each location
- Overnight shifts (11pm-3am) handled correctly
- DST transitions handled automatically

**Design Decisions:**
- Staff availability uses "clock time" (see [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md#1-timezone--availability-the-timezone-tangle))
- Multi-location staff availability applies per-location local time
- Rationale: Matches user mental model, simplifies UX

---

## 📝 Known Limitations & Assumptions

### Intentional Design Choices

1. **Availability Timezone:** Global clock time, not per-location (see DESIGN_DECISIONS.md)
2. **Email Notifications:** Simulated (console.log) - production would use SendGrid/AWS SES
3. **Desired Hours:** Soft target for fairness, not hard constraint
4. **Consecutive Days:** Any shift counts as worked day (1hr = full day)
5. **Historical Data:** Preserved on de-certification for audit compliance

### Technical Limitations

- **No offline mode:** Requires internet connection
- **Browser support:** Modern browsers only (ES2020+)
- **Real-time requires:** WebSocket connection to Supabase
- **Large datasets:** Schedule view optimized for weekly view, not year-long

### Future Enhancements

- Mobile app (React Native)
- SMS notifications via Twilio
- Shift templates for recurring schedules
- Automated scheduling AI suggestions
- Integration with POS systems for actual clock-in data

---

## 🧪 Seed Data

**Pre-populated test data:**
- 4 locations (New York, Boston, LA, Seattle)
- 3 managers with different location assignments
- 12 staff members with varied skills and certifications
- Sample shifts for next 7 days
- Pre-configured availability rules

See [TEST_CREDENTIALS.md](./TEST_CREDENTIALS.md) for all login credentials and [docs/DATA_REFERENCE.md](./docs/DATA_REFERENCE.md) for full seed data details.

---

## 🚀 Development Setup

### Prerequisites
- Node.js 20+
- pnpm 9+
- Supabase account

### Environment Variables
Copy `.env.example` to `.env.local`:
```bash
DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Installation
```bash
# Install dependencies
pnpm install

# Push database schema
pnpm db:push

# Seed test data
pnpm db:seed

# Create Supabase auth users
pnpm db:create-auth

# Start development server
pnpm dev
```

Visit http://localhost:3000

### Database Management
```bash
# Generate new migration
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Open Drizzle Studio
pnpm db:studio

# Reset and reseed
pnpm db:push && pnpm db:seed && pnpm db:create-auth
```

---

## 📁 Project Structure

```
shiftsync/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── schedules/         # Weekly calendar, shift CRUD
│   │   ├── my-shifts/         # Staff view of assigned shifts
│   │   ├── swap-requests/     # Manager approval queue
│   │   ├── overtime/          # Overtime tracking dashboard
│   │   ├── fairness/          # Fairness analytics
│   │   ├── on-duty/           # Real-time on-duty staff
│   │   ├── audit/             # Audit log viewer
│   │   └── notifications/     # Notification center
│   ├── components/            # Reusable UI components
│   │   ├── ui/               # shadcn/ui primitives
│   │   └── app-nav.tsx       # Main navigation
│   ├── db/                    # Database layer
│   │   ├── schema.ts         # Drizzle schema
│   │   ├── seed.ts           # Test data
│   │   └── index.ts          # DB client
│   ├── lib/                   # Utilities
│   │   ├── auth.ts           # Authentication helpers
│   │   ├── constraints.ts    # Constraint validation logic
│   │   ├── audit.ts          # Audit logging
│   │   ├── date-utils.ts     # Timezone-safe date formatting
│   │   └── supabase/         # Supabase client setup
│   └── hooks/                 # React hooks
│       └── useRealtimeSubscription.ts
├── docs/                      # Additional documentation
│   └── DATA_REFERENCE.md     # Seed data reference
├── DESIGN_DECISIONS.md       # Ambiguity resolutions
└── TEST_CREDENTIALS.md       # Login credentials
```

---

## 🎓 Design Philosophy

This project demonstrates:

1. **User-Centered Design** - Clear error messages, helpful suggestions, intuitive workflows
2. **Data Integrity** - Optimistic locking, constraint enforcement, audit trails
3. **Real-World Complexity** - Timezone handling, overnight shifts, DST transitions
4. **Production Readiness** - Security, error handling, documentation
5. **Pragmatic Tradeoffs** - 72-hour constraint = features over test coverage

---

## 📧 Support

For questions about this implementation:
- See [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md) for design rationale
- Check [TEST_CREDENTIALS.md](./TEST_CREDENTIALS.md) for login issues

---

**Built by Enoch Kambale for Priority Soft Full-Stack Developer Assessment**
