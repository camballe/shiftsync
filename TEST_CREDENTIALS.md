# Test Account Credentials

**All passwords are: `shiftsync2026`**

## Admin
```
Email: admin@shiftsync.com
Role: Admin (full access to all locations and audit logs)
```

## Managers

### Sarah Johnson
```
Email: sarah.manager@shiftsync.com
Manages: New York Store (EST), Boston Store (EST)
```

### Mike Chen
```
Email: mike.manager@shiftsync.com
Manages: Los Angeles Store (PST)
```

### Lisa Martinez
```
Email: lisa.manager@shiftsync.com
Manages: Seattle Store (PST)
```

## Staff

### Alex Rivera - Multi-Skilled
```
Email: alex.staff@shiftsync.com
Skills: Barista, Cashier, Supervisor
```

### Jordan Smith - Barista/Cashier
```
Email: jordan.staff@shiftsync.com
Skills: Barista, Cashier
```

### Taylor Brown - Opener Specialist
```
Email: taylor.staff@shiftsync.com
Skills: Barista, Opener
```

### Morgan Lee - Closer Specialist
```
Email: morgan.staff@shiftsync.com
Skills: Cashier, Closer
```

### Additional Staff
```
Casey Davis     - casey.staff@shiftsync.com
Riley Wilson    - riley.staff@shiftsync.com
Avery Taylor    - avery.staff@shiftsync.com
Quinn Anderson  - quinn.staff@shiftsync.com
Drew Martinez   - drew.staff@shiftsync.com
Sage Thompson   - sage.staff@shiftsync.com
```

---

## Quick Test Login Sequence

1. **Admin Test:**
   - Login: admin@shiftsync.com
   - Should see: All 4 locations, audit logs access

2. **Manager Test:**
   - Login: sarah.manager@shiftsync.com
   - Should see: Only New York Store & Boston Store in location dropdown

3. **Staff Test:**
   - Login: alex.staff@shiftsync.com
   - Should see: My Shifts page, limited navigation

---

## Notes
- All accounts use the same password: `shiftsync2026`
- The email format is: `[firstname].[role]@shiftsync.com`
- Staff cannot access scheduling pages
- Managers can only see their assigned locations
- Admin can see everything
