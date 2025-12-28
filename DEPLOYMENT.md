# Deployment Guide - BLE Attendance Backend

## Northflank Deployment (Backend)

### 1. Create New Service
- Go to Northflank Dashboard → Create Service → Combined Service
- Connect your GitHub repo
- Select `attendance-backend` as the build context

### 2. Build Settings
- **Dockerfile Path**: `Dockerfile`
- **Build Context**: `attendance-backend`

### 3. Environment Variables (Add in Northflank)

```env
# Supabase Configuration (REQUIRED)
SUPABASE_URL=https://xutqesrorqiztfkowdyh.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dHFlc3JvcnFpenRma293ZHloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3MTU5NzksImV4cCI6MjA4MjI5MTk3OX0.PTrKWtH8fgGzZmgRH6q1xkKzwbIPrjJR4tdeAo2qzNc
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dHFlc3JvcnFpenRma293ZHloIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjcxNTk3OSwiZXhwIjoyMDgyMjkxOTc5fQ.84y4HY6JpVZeO7324S9uYI_Uryqpj50ujhFBjoAt-F8

# JWT Secret (for teacher auth)
JWT_SECRET=your-secure-jwt-secret-change-this-in-production

# Server Configuration
PORT=3000
NODE_ENV=production

# Demo Mode (keep enabled for project demo)
DEMO_MODE=true
```

### 4. Port Configuration
- **Internal Port**: 3000
- **Public Port**: 443 (HTTPS)

### 5. Health Check
- **Path**: `/api/health`
- **Interval**: 30s

### 6. After Deployment
Note your Northflank URL, e.g.: `https://your-app.northflank.app`

---

## Vercel Deployment (React Dashboard)

### 1. Import Project
- Go to Vercel Dashboard → Add New → Project
- Import from GitHub
- Select `Attendance-System-React` repo
- Set **Root Directory** to `client`

### 2. Build Settings
- **Framework Preset**: Create React App
- **Build Command**: `npm run build`
- **Output Directory**: `build`

### 3. Environment Variables (Add in Vercel)

```env
# Backend API URL (your Northflank URL)
REACT_APP_API_URL=https://your-backend.northflank.app

# Supabase (for direct client access if needed)
REACT_APP_SUPABASE_URL=https://xutqesrorqiztfkowdyh.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dHFlc3JvcnFpenRma293ZHloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3MTU5NzksImV4cCI6MjA4MjI5MTk3OX0.PTrKWtH8fgGzZmgRH6q1xkKzwbIPrjJR4tdeAo2qzNc
```

### 4. After Deployment
Note your Vercel URL, e.g.: `https://your-dashboard.vercel.app`

---

## Flutter App Configuration

Update `attendance_app/lib/core/constants/api_constants.dart`:

```dart
class ApiConstants {
  // Production backend URL (Northflank)
  static const String baseUrl = 'https://your-backend.northflank.app';
  
  // ... rest of the file
}
```

---

## Quick Reference - All URLs

| Service | Platform | URL |
|---------|----------|-----|
| Backend API | Northflank | `https://your-backend.northflank.app` |
| React Dashboard | Vercel | `https://your-dashboard.vercel.app` |
| Supabase | Supabase | `https://xutqesrorqiztfkowdyh.supabase.co` |

---

## Testing Production

1. **Health Check**: `curl https://your-backend.northflank.app/api/health`
2. **Dashboard**: Open `https://your-dashboard.vercel.app`
3. **Flutter App**: Update API URL and test on physical device

---

## Troubleshooting

### CORS Issues
The backend already has CORS configured for all origins. If you face issues:
- Check Northflank logs for errors
- Verify `REACT_APP_API_URL` doesn't have trailing slash

### Database Connection
- Supabase credentials are the same for all environments
- Check Northflank logs if Supabase connection fails

### Demo Mode
- `DEMO_MODE=true` enables auto-session creation
- Keep this enabled for your project demo
