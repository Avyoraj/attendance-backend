# Attendance Backend (Supabase)

## Overview
Supabase-only backend with request-ID logging, per-route rate limits, and correlation-gated two-step attendance (provisional → confirm).

## Running
```pwsh
npm install
npm run dev
```
Server defaults to PORT 3000. Health: `http://localhost:3000/api/health`.

## Seeding (Supabase)
```pwsh
npm run seed
```
This runs `scripts/setup-supabase.js` and checks connectivity. Legacy Mongo seeds are deprecated.

## Rate Limits
- General (most routes): 200 requests / 15 minutes.
- Check-in/confirm/streams: 20 requests / 60 seconds.

## Request IDs
Every request gets an `X-Request-Id` (uuid). Logs print: `<id> <method> <path> <status> <ms>`.

## Correlation gate
Confirm blocks if suspicious correlation is detected for today’s class/session (uses RSSI streams). Teacher override can bypass by sending `teacherOverride: true` in confirm payload.

## Cleaning test data
Use Supabase cleaners:
```pwsh
node clear-attendance-supabase.js --today
node clear-anomalies-supabase.js --today --rssi
```

## Deprecations / Removed Mongo
- Legacy Mongo scripts and server-old are removed/disabled.
- `utils/database.js` now throws if imported.
- Use Supabase equivalents for all data operations.
