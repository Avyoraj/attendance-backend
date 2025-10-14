# Database Cleanup Guide

Quick reference for clearing attendance records during testing.

## Quick Clear (No Confirmation)

**Delete ALL records immediately:**
```bash
cd attendance-backend
node clear-all-attendance.js
```

**Output:**
```
✅ Connected to attendance database
📊 Found 15 record(s) to delete
✅ Successfully deleted 15 record(s)
🧹 Attendance database cleared!
```

## Interactive Clear (With Confirmation)

**Clear all with confirmation:**
```bash
cd attendance-backend
node clear-attendance.js
```

**Clear specific student:**
```bash
node clear-attendance.js --student=32
```

**Clear specific class:**
```bash
node clear-attendance.js --class=101
```

**Clear by date:**
```bash
node clear-attendance.js --date=2025-10-14
```

**Clear multiple filters:**
```bash
node clear-attendance.js --student=32 --class=101
```

**Example Output:**
```
✅ Connected to attendance database

⚠️  About to delete 5 record(s)
Query: DELETE FROM attendance WHERE studentId = ? AND classId = ?
Params: [ '32', '101' ]

Proceed? (yes/no): yes
✅ Successfully deleted 5 record(s)

📋 Recent remaining records:
  - Student 70, Class 101, Status: confirmed, Time: 2025-10-14 11:45:23
  - Student 88, Class 101, Status: provisional, Time: 2025-10-14 11:40:15
```

## Verify Database Contents

**View all records:**
```bash
cd attendance-backend
sqlite3 attendance.db "SELECT * FROM attendance ORDER BY checkInTime DESC;"
```

**Count records:**
```bash
sqlite3 attendance.db "SELECT COUNT(*) FROM attendance;"
```

**View by student:**
```bash
sqlite3 attendance.db "SELECT * FROM attendance WHERE studentId='32' ORDER BY checkInTime DESC;"
```

**View by status:**
```bash
sqlite3 attendance.db "SELECT * FROM attendance WHERE status='provisional';"
```

## Testing Workflow

### For Quick Back-to-Back Testing:

```bash
# 1. Clear database
cd attendance-backend
node clear-all-attendance.js

# 2. Hot restart app (in flutter terminal)
R

# 3. Test check-in flow
# 4. Repeat from step 1
```

### For Selective Testing:

```bash
# Clear only your test student
node clear-attendance.js --student=32

# Test with student 32
# Then clear just that student's records again
```

## Troubleshooting

**Error: Database locked**
- Stop the backend server first: `Ctrl+C` in backend terminal
- Run cleanup script
- Restart backend

**Error: Cannot find database**
- Make sure you're in `attendance-backend` directory
- Check if `attendance.db` exists
- If missing, start backend once to create it

**Records not clearing**
- Check if you're running the script from correct directory
- Verify database path is correct
- Try using full path: `sqlite3 /path/to/attendance.db`

## Safety Notes

⚠️ **clear-all-attendance.js** deletes immediately without confirmation
- Use for rapid testing only
- Cannot be undone

✅ **clear-attendance.js** shows confirmation prompt
- Safer for production-like testing
- Shows what will be deleted before executing
- Can cancel with 'no'

## Quick Commands Cheat Sheet

```bash
# Clear everything (fast)
node clear-all-attendance.js

# Clear student 32
node clear-attendance.js --student=32

# Clear class 101
node clear-attendance.js --class=101

# Clear today's records
node clear-attendance.js --date=$(date +%Y-%m-%d)

# View all records
sqlite3 attendance.db "SELECT * FROM attendance;"

# Count records
sqlite3 attendance.db "SELECT COUNT(*) FROM attendance;"
```

## Database Schema Reference

```sql
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  studentId TEXT NOT NULL,
  classId TEXT NOT NULL,
  deviceId TEXT NOT NULL,
  status TEXT CHECK(status IN ('provisional', 'confirmed', 'absent')),
  checkInTime TEXT NOT NULL,
  confirmedTime TEXT,
  rssi INTEGER,
  ...
);
```

**Key Fields:**
- `studentId`: Student identifier (e.g., "32", "70")
- `classId`: Class identifier (e.g., "101")
- `status`: provisional | confirmed | absent
- `checkInTime`: When provisional check-in occurred
- `confirmedTime`: When confirmation completed
