# Design Decisions & Intentional Ambiguity Resolutions

This document addresses the intentional ambiguities in the requirements and explains key design decisions made during implementation.

---

## 1. Timezone & Availability: "The Timezone Tangle"

**Requirement Ambiguity:**
> A staff member is certified at a location in Pacific time and another in Eastern time. They set availability as "9am-5pm". What happens?

**Design Decision: Clock-Time Availability (Location-Agnostic)**

Availability is stored as **clock time** in the staff member's recurring availability rules. When a staff member sets "9am-5pm Monday", this means:
- Available **9am-5pm Eastern** at New York location (UTC-5)
- Available **9am-5pm Pacific** at Los Angeles location (UTC-8)

This represents **different absolute time windows** (6am-2pm Pacific = 9am-5pm Eastern).

**Rationale:**
1. **User Mental Model**: People think in "I'm available mornings" not "I'm available 14:00-22:00 UTC"
2. **Work-Life Balance**: Staff certified at multiple locations likely live near one. If they set "9am-5pm", they mean their local waking hours, not absolute UTC hours
3. **Simplicity**: No need to ask "which timezone do you mean?" when setting availability
4. **Constraint Enforcement**: The system still prevents overlaps and enforces rest periods correctly across timezones

**Alternative Considered:**
Store availability in UTC or per-location. Rejected because:
- Adds UI complexity ("Set availability for New York", "Set availability for LA")
- DST transitions would require twice-yearly updates
- Most staff work primarily at one location despite multi-certification

**User Clarity:**
The availability settings page shows: *"Your availability applies as local clock time at each location you're certified for."*

---

## 2. Historical Data & De-Certification

**Requirement Ambiguity:**
> What happens to historical data when a staff member is de-certified from a location?

**Design Decision: Preserve Historical Data, Block Future Assignments**

When a staff member is de-certified from a location:
- ✅ **Past shifts remain in database** with full audit trail
- ✅ **Future unpublished shifts** at that location trigger a warning to managers
- ❌ **Cannot be assigned new shifts** at that location
- ✅ **Swap requests** involving that location are auto-rejected

**Rationale:**
- **Audit Compliance**: Labor law requires historical shift records
- **Payroll Integrity**: Past shifts must remain for payment processing
- **Reporting Accuracy**: Overtime and fairness reports need complete history

**Implementation:**
- Constraint check at assignment time (see `checkLocationCertification()` in `src/lib/constraints.ts`)
- Soft delete approach: certification removed from `staff_location_certs`, but historical `shift_assignments` remain

---

## 3. Desired Hours vs Availability Windows

**Requirement Ambiguity:**
> How should "desired hours" interact with availability windows?

**Design Decision: Availability is Hard Constraint, Desired Hours is Soft Target**

- **Availability Windows**: Hard constraint enforced during assignment
  - System blocks assignments outside these windows
  - Shown as errors in constraint validation

- **Desired Hours** (stored in `users.desired_hours_per_week`): Soft target for fairness
  - Not enforced during assignment
  - Used in fairness analytics to show over/under-scheduling
  - Managers see warnings when staff is 10+ hours above/below desired

**Rationale:**
- **Flexibility**: Sometimes staff want extra hours (holidays, saving for something)
- **Business Needs**: Can't hard-block schedules just because someone hit their preferred hours
- **Fairness Visibility**: The fairness dashboard highlights systematic over/under-scheduling

**User Experience:**
- Desired hours input shows: *"This is used for fair distribution tracking, not as a hard limit"*
- Fairness dashboard colors: Green (within 5 hours), Yellow (5-10 hours variance), Red (10+ hours variance)

---

## 4. Consecutive Days Calculation

**Requirement Ambiguity:**
> When calculating consecutive days, does a 1-hour shift count the same as an 11-hour shift?

**Design Decision: Any Shift Counts as a Worked Day**

For consecutive days warnings (6th/7th day):
- A day with **any shift assignment** counts as a worked day
- Duration is irrelevant (1-hour shift = full day worked)

**Rationale:**
1. **Labor Law Alignment**: California IWC orders define "day of work" as any day with work performed
2. **Rest Period Intent**: The rule protects against overwork fatigue, which applies even with short shifts
3. **Simplicity**: Clear rule with no edge cases ("does 2.5 hours count?")

**Implementation:**
See `checkConsecutiveDays()` in `src/lib/constraints.ts:463-490`

---

## 5. Swap Requests & Shift Modifications

**Requirement Ambiguity:**
> If a shift is edited after swap approval but before it occurs, what should happen?

**Design Decision: Auto-Cancel Pending Swaps, Preserve Approved Swaps**

| Swap Status | Shift Edited | Behavior |
|-------------|--------------|----------|
| PENDING | ✅ | **Auto-cancel** swap with notification to both parties |
| APPROVED | ✅ | **Preserve** swap, update both staff with new shift details |
| DENIED | ✅ | No action needed (swap already resolved) |

**Rationale:**
- **PENDING**: Swap was based on old shift details (time/skill). Auto-cancel forces re-evaluation
- **APPROVED**: Manager has already reviewed. Honor the approved swap but notify of changes

**Implementation:**
- See `updateShift()` in `src/app/schedules/[locationId]/actions.ts:148-174`
- Notifications sent via `createNotifications()` with type `SHIFT_MODIFIED`

---

## 6. Timezone Boundary Locations

**Requirement Ambiguity:**
> How should the system handle a location that spans a timezone boundary?

**Design Decision: One Timezone Per Location**

Each location has **exactly one timezone** (stored in `locations.timezone` as IANA timezone string, e.g., "America/New_York").

For locations near timezone boundaries:
- Create **two separate locations** in the system (e.g., "Phoenix East Side", "Phoenix West Side")
- Staff can be certified for both
- Schedules are managed independently

**Rationale:**
- **Shift Timing**: A shift must have one start time. Can't be "9am MST and 9am PST"
- **Labor Law**: Overtime calculations use location timezone. Mixed timezones would create ambiguity
- **Practical Reality**: Even restaurants with two sides typically treat them as separate operations

**Edge Case Handling:**
- If a location physically spans timezones, recommend using the timezone where the time clock/manager office is located
- Document this in onboarding: "Use the timezone where staff clock in"

---

## 7. Overnight Shifts & Date Boundaries

**Implementation Detail:**

Shifts from 11pm-3am are stored as:
- `date`: The date the shift **starts** (e.g., "2026-02-28")
- `start_time`: "23:00"
- `end_time`: "03:00"

**Rationale:**
- Simplifies querying (all shifts for Feb 28 include the 11pm-3am shift)
- Hours calculation: If `end_time <= start_time`, assume next day
- Matches industry standard (hospitality considers overnight shifts part of the starting day)

**Constraint Enforcement:**
- Rest period calculation accounts for overnight shifts (see `checkRestPeriod()` in `src/lib/constraints.ts:251-326`)
- Double-booking checks correctly handle "11pm-3am today" vs "1am-9am tomorrow" overlap

---

## 8. Daylight Saving Time Handling

**Implementation:**

- **Stored Times**: All times stored as `TIME` (clock time) without timezone offset
- **DST Transitions**:
  - Spring forward (2am → 3am): A "2:00am-10:00am" shift becomes 7 hours instead of 8
  - Fall back (2am → 1am): A "2:00am-10:00am" shift becomes 9 hours instead of 8

**Rationale:**
- **Matches Business Practice**: Restaurants typically operate on "wall clock time"
- **Overtime Calculations**: Use actual elapsed time (7 or 9 hours) for labor law compliance
- **User Experience**: Staff see "2am-10am" on schedule regardless of DST

**Implementation:**
- Hour calculations use JavaScript `Date` arithmetic which handles DST correctly
- Weekly hour limits account for DST week variations (see `checkWeeklyHours()` in `src/lib/constraints.ts:428-461`)

---

## 9. Concurrent Operation Safety

**Requirement:**
> If two managers try to assign the same staff member simultaneously, one should see a conflict notification immediately

**Design Decision: Multi-Layer Concurrency Protection**

Three complementary strategies prevent data corruption under concurrent operations:

1. **Optimistic Locking (Shift Edits)**: Shifts have a `version` integer column. Updates use atomic `UPDATE...WHERE version = X` — if 0 rows affected, the shift was modified concurrently and the user sees a clear error.

2. **Advisory Locks (Assignments & Swaps)**: `pg_advisory_xact_lock(hashtext(id))` serializes concurrent operations on the same entity within a transaction. This prevents TOCTOU (Time-of-Check-Time-of-Use) race conditions where two managers pass the constraint check simultaneously.

3. **Real-time Broadcasting**: Supabase Realtime broadcasts all changes. When Manager A assigns a staff member, Manager B sees the update immediately without refreshing.

**Race Condition Handling:**
```
Timeline:
T0: Manager A and B both load shift (version 1)
T1: Manager A assigns Staff X → advisory lock acquired, constraint check, insert, lock released
T2: Manager B tries to assign Staff X → advisory lock acquired, constraint check FAILS (overlap detected)
T3: Manager B sees clear error + real-time update showing Staff X already assigned
```

**Operations Protected:**
- `assignStaffToShift` — advisory lock on staffId
- `updateShift` — atomic version-checked update
- `deleteShift` — advisory lock on shiftId
- `publishShift` / `unpublishShift` — atomic state-checked update
- `approveSwapRequest` / `denySwapRequest` / `cancelSwapRequest` — advisory lock on requestId

---

## 10. 7th Consecutive Day Manager Override

**Requirement:**
> 7th consecutive day worked in a week (requires manager override with documented reason)

**Design Decision: Override UI with Mandatory Reason**

When the 7th consecutive day is the only constraint violation:
- The "Assign" button is replaced with an "Override (7th Day)" button
- Clicking it opens a dialog requiring a text reason (e.g., "Short-staffed due to flu season")
- The reason is stored in the audit log alongside the assignment
- If there are other constraint violations (e.g., overlap + 7th day), override is not available

**Rationale:**
- Requirements explicitly state "requires manager override with documented reason"
- Making it an override (not a warning) ensures conscious decision-making
- Audit trail captures the reason for compliance review
- Other constraint violations cannot be bypassed — only the 7th-day rule supports overrides

**Implementation:**
- `assignStaffToShift()` accepts optional `overrideReason` parameter
- Validation returns `overridable: true` when only error is `SEVENTH_CONSECUTIVE_DAY`
- UI shows AlertDialog with Textarea for reason entry
- Audit log includes `overrideReason` and `overrideCode` fields

---

## 11. Notification Preferences

**Design Decision: In-App Default, Email Simulation**

- All users get **in-app notifications** by default
- Email toggle stored in `users.notification_preferences` JSONB: `{ inApp: true, email: false }`
- "Email" notifications are **simulated** (logged to console, not sent via SMTP)

**Rationale:**
- **Assessment Context**: No email server setup required for evaluation
- **Production Ready**: Swap `console.log()` for actual email service (SendGrid/AWS SES)
- **User Control**: Preferences UI lets users disable in-app notifications

**See:** `src/app/notifications/actions.ts:13-45`

---

## 12. Soft vs Hard Constraints

**Design Decision:**
- **Hard constraints** (block assignment): overlap, 10h rest, skill match, location cert, availability, 12h daily max
- **Soft constraints** (warn only): 8h daily, 35h weekly, 6th consecutive day
- **Overridable constraint** (requires documented reason): 7th consecutive day

**Rationale:**
- Requirements explicitly distinguish between "block", "warn", and "requires manager override"
- Hard constraints enforce legal/safety minimums
- Soft constraints provide flexibility for managers
- 7th-day override requires conscious decision with audit trail

---

## Summary

These design decisions prioritize:
1. ✅ **User Mental Models**: Clock time over UTC
2. ✅ **Labor Law Compliance**: Audit trails, rest periods, overtime tracking
3. ✅ **System Robustness**: Optimistic locking, constraint enforcement
4. ✅ **Practical Business Needs**: Flexibility where appropriate, hard constraints where required

All ambiguities have been resolved with defensible, documented rationale.
