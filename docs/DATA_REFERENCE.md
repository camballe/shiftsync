# ShiftSync Seed Data Reference

**THIS IS THE SINGLE SOURCE OF TRUTH FOR ALL TEST DATA**

All documentation MUST reference this file to ensure consistency. Any changes to seed data MUST be reflected here first.

---

## Locations (4 Total)

| ID | Name | Timezone | Managed By |
|----|------|----------|------------|
| 1 | New York Store | America/New_York (EST) | Sarah Johnson |
| 2 | Boston Store | America/New_York (EST) | Sarah Johnson |
| 3 | Los Angeles Store | America/Los_Angeles (PST) | Mike Chen |
| 4 | Seattle Store | America/Los_Angeles (PST) | Lisa Martinez |

---

## Skills (5 Total)

1. **Barista** - Coffee preparation and beverage making
2. **Cashier** - Register operation and customer checkout
3. **Opener** - Opening procedures and setup
4. **Closer** - Closing procedures and cleanup
5. **Supervisor** - Team leadership and oversight

**DO NOT REFERENCE:** Server, Bartender, Line Cook, Host (these don't exist)

---

## Test Accounts

### Admin
- **Email:** admin@shiftsync.com
- **Password:** shiftsync2026
- **Name:** Admin User
- **Role:** ADMIN
- **Access:** All locations, audit logs

### Managers

**Sarah Johnson**
- **Email:** sarah.manager@shiftsync.com
- **Password:** shiftsync2026
- **Role:** MANAGER
- **Manages:** New York Store, Boston Store

**Mike Chen**
- **Email:** mike.manager@shiftsync.com
- **Password:** shiftsync2026
- **Role:** MANAGER
- **Manages:** Los Angeles Store

**Lisa Martinez**
- **Email:** lisa.manager@shiftsync.com
- **Password:** shiftsync2026
- **Role:** MANAGER
- **Manages:** Seattle Store

### Staff

**Alex Rivera** (Multi-Skilled)
- **Email:** alex.staff@shiftsync.com
- **Password:** shiftsync2026
- **Skills:** Barista, Cashier, Supervisor
- **Certified Locations:** New York Store, Boston Store

**Jordan Smith** (Barista/Cashier)
- **Email:** jordan.staff@shiftsync.com
- **Password:** shiftsync2026
- **Skills:** Barista, Cashier
- **Certified Locations:** New York Store, Boston Store

**Taylor Brown** (Opener Specialist)
- **Email:** taylor.staff@shiftsync.com
- **Password:** shiftsync2026
- **Skills:** Barista, Opener
- **Certified Locations:** New York Store, Boston Store

**Morgan Lee** (Closer Specialist)
- **Email:** morgan.staff@shiftsync.com
- **Password:** shiftsync2026
- **Skills:** Cashier, Closer
- **Certified Locations:** New York Store, Boston Store

**Casey Davis**
- **Email:** casey.staff@shiftsync.com
- **Password:** shiftsync2026
- **Skills:** Barista, Cashier
- **Certified Locations:** Los Angeles Store, Seattle Store

**Riley Wilson**
- **Email:** riley.staff@shiftsync.com
- **Password:** shiftsync2026
- **Skills:** Cashier, Closer
- **Certified Locations:** Los Angeles Store, Seattle Store

**Avery Taylor**
- **Email:** avery.staff@shiftsync.com
- **Password:** shiftsync2026
- **Skills:** Opener, Supervisor
- **Certified Locations:** Los Angeles Store, Seattle Store

**Quinn Anderson**
- **Email:** quinn.staff@shiftsync.com
- **Password:** shiftsync2026
- **Skills:** Barista, Closer
- **Certified Locations:** New York Store, Los Angeles Store

**Drew Martinez**
- **Email:** drew.staff@shiftsync.com
- **Password:** shiftsync2026
- **Skills:** Cashier, Supervisor
- **Certified Locations:** Boston Store, Seattle Store

**Sage Thompson**
- **Email:** sage.staff@shiftsync.com
- **Password:** shiftsync2026
- **Skills:** Barista, Opener
- **Certified Locations:** New York Store, Seattle Store

---

## Pre-Seeded Shifts

The seed creates 5 sample shifts across the next few days:

1. **New York Store - Tomorrow**
   - Time: 09:00 - 17:00
   - Skill: Barista
   - Headcount: 2
   - Status: Draft
   - Assignments: Alex Rivera

2. **New York Store - Tomorrow**
   - Time: 14:00 - 22:00
   - Skill: Cashier
   - Headcount: 1
   - Status: Published
   - Assignments: Jordan Smith

3. **Boston Store - Day After Tomorrow**
   - Time: 06:00 - 14:00
   - Skill: Opener
   - Headcount: 1
   - Status: Published
   - Assignments: Taylor Brown

4. **Los Angeles Store - 3 Days From Now**
   - Time: 10:00 - 18:00
   - Skill: Barista
   - Headcount: 3
   - Status: Draft
   - Assignments: None

5. **Seattle Store - 3 Days From Now**
   - Time: 16:00 - 23:00
   - Skill: Closer
   - Headcount: 1
   - Status: Published
   - Assignments: Riley Wilson

---

## Email Format

All test account emails follow this pattern:
```
[firstname].[role]@shiftsync.com
```

Examples:
- sarah.manager@shiftsync.com
- alex.staff@shiftsync.com
- admin@shiftsync.com (exception - no firstname)

---

## Common Testing Scenarios

### Creating a Valid Shift
- **Location:** New York Store (if logged in as Sarah)
- **Date:** Any future date
- **Time:** 09:00 - 17:00 (standard day shift)
- **Skill:** Barista or Cashier (most staff have these)
- **Headcount:** 1-3

### Overnight Shift Test
- **Time:** 23:00 - 03:00
- **Skill:** Closer (appropriate for late hours)
- **Staff:** Morgan Lee or Riley Wilson

### Multi-Timezone Test
- **Staff:** Quinn Anderson (certified at NY and LA - 3hr difference)
- **Availability:** 09:00-17:00 applies as local time at each location

### Constraint Violation Tests
- **Double-booking:** Assign Jordan to overlapping shifts
- **Skill mismatch:** Try to assign Morgan (Cashier/Closer) to Barista shift
- **Location cert:** Try to assign Alex to Los Angeles shift (not certified)
- **Overtime:** Assign same staff to multiple shifts totaling 40+ hours

---

## Verification Checklist

Before updating any documentation, verify:

- [ ] Location names match: New York Store, Boston Store, Los Angeles Store, Seattle Store
- [ ] Skill names match: Barista, Cashier, Opener, Closer, Supervisor
- [ ] Staff names match actual seed data (Alex, Jordan, Taylor, Morgan, etc.)
- [ ] Email format is correct: [firstname].[role]@shiftsync.com
- [ ] Password is: shiftsync2026
- [ ] Manager assignments are correct (Sarah → NY+Boston, Mike → LA, Lisa → Seattle)
- [ ] Staff skills match their specialization
- [ ] Timezone references are America/New_York or America/Los_Angeles

---

**Last Updated:** 2026-02-27
**Source:** `/src/db/seed.ts`
