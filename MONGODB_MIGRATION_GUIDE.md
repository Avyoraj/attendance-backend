# 🚀 MongoDB Migration Complete!

## ✅ What Changed

Your attendance backend has been upgraded from SQLite to MongoDB with support for:

1. **Device ID Locking** - Prevent proxy attendance
2. **Two-Step Attendance** - Provisional → Confirmed states
3. **RSSI Streaming** - Data collection for co-location analysis
4. **Anomaly Detection** - Flag suspicious attendance patterns

---

## 📦 Installation Steps

### 1. Install Dependencies

```bash
cd attendance-backend
npm install
```

This will install:
- `mongoose` - MongoDB ODM
- `dotenv` - Environment variable management
- `express` - Web framework
- `cors` - CORS support

### 2. Configure MongoDB

Create a `.env` file in the `attendance-backend` folder:

```env
MONGODB_URI=your_mongodb_connection_string_here
DATABASE_NAME=attendance_system
PORT=3000
NODE_ENV=development
JWT_SECRET=your-secret-key-here
```

**Get your MongoDB URI:**
1. Go to MongoDB Atlas (cloud.mongodb.com)
2. Click "Connect" on your cluster
3. Choose "Connect your application"
4. Copy the connection string
5. Replace `<password>` with your actual password

Example:
```
mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/attendance_system?retryWrites=true&w=majority
```

### 3. Test Locally

```bash
npm run dev
```

You should see:
```
🚀 Connected to MongoDB successfully!
📊 Database: attendance_system
🚀 Server running on http://localhost:3000
```

### 4. Test the API

```bash
# Health check
curl http://localhost:3000/api/health

# Test check-in
curl -X POST http://localhost:3000/api/check-in \
  -H "Content-Type: application/json" \
  -d '{"studentId":"S001","classId":"CS101","deviceId":"test-device-123","rssi":-65}'
```

---

## 🌐 Deploy to Vercel

### 1. Update Vercel Environment Variables

In your Vercel dashboard:
1. Go to your project settings
2. Add environment variable:
   - `MONGODB_URI` = your connection string
   - `DATABASE_NAME` = `attendance_system`

### 2. Deploy

```bash
vercel --prod
```

Or push to GitHub (if connected to Vercel).

---

## 📊 Database Collections Created

Your MongoDB will have these collections:

### 1. **students**
```javascript
{
  studentId: "S001",
  name: "John Doe",
  deviceId: "unique-device-id",
  deviceRegisteredAt: Date,
  isActive: true
}
```

### 2. **attendances**
```javascript
{
  studentId: "S001",
  classId: "CS101",
  deviceId: "unique-device-id",
  status: "provisional", // or "confirmed", "left_early"
  checkInTime: Date,
  confirmedAt: Date,
  rssi: -65,
  distance: 2.5,
  sessionDate: Date
}
```

### 3. **rssistreams** (for co-location detection)
```javascript
{
  studentId: "S001",
  classId: "CS101",
  sessionDate: Date,
  rssiData: [
    { timestamp: Date, rssi: -65, distance: 2.5 },
    { timestamp: Date, rssi: -67, distance: 2.8 }
  ],
  totalReadings: 120
}
```

### 4. **anomalyflags**
```javascript
{
  classId: "CS101",
  sessionDate: Date,
  flaggedUsers: ["S001", "S002"],
  correlationScore: 0.97,
  severity: "high",
  status: "pending"
}
```

---

## 🔌 API Endpoints

### Core Attendance

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/check-in` | Mark attendance (provisional) |
| POST | `/api/attendance/confirm` | Confirm attendance |
| GET | `/api/attendance` | Get attendance records |

### RSSI Streaming

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/check-in/stream` | Upload RSSI data |
| GET | `/api/rssi-streams` | Get RSSI streams |

### Anomaly Detection

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/anomalies` | Get detected anomalies |
| POST | `/api/anomalies` | Create anomaly flag |

### Student Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/students/register` | Register device |
| GET | `/api/students/:studentId` | Get student info |

---

## 🔧 Flutter App Changes Needed

### Minimal Changes Required!

The `/api/check-in` endpoint is **backward compatible**, but you should add:

#### 1. Send Device ID

```dart
// In http_service.dart or wherever you call check-in
await http.post(
  Uri.parse('$baseUrl/api/check-in'),
  body: jsonEncode({
    'studentId': studentId,
    'classId': classId,
    'deviceId': deviceId,  // ADD THIS
    'rssi': rssi,          // ADD THIS (from beacon)
    'distance': distance   // ADD THIS (optional)
  }),
);
```

#### 2. Handle New Response

```dart
// Response includes status now
{
  "message": "Attendance recorded successfully",
  "status": "provisional",  // NEW
  "attendance": {
    "id": "...",
    "status": "provisional",
    "checkInTime": "2025-10-14T10:00:00Z"
  }
}
```

---

## ✅ Verification Checklist

- [ ] MongoDB Atlas cluster created
- [ ] Connection string added to `.env`
- [ ] `npm install` completed
- [ ] Server starts without errors
- [ ] Health endpoint returns `{"status": "ok"}`
- [ ] Test check-in creates student automatically
- [ ] Dashboard shows attendance records
- [ ] Vercel environment variables configured
- [ ] Deployed to Vercel successfully

---

## 🐛 Troubleshooting

### Connection Error
```
Error: MONGODB_URI is not defined
```
**Fix:** Create `.env` file with your MongoDB URI

### Authentication Failed
```
MongoServerError: bad auth
```
**Fix:** Check your MongoDB password in the connection string

### Network Error
```
MongoNetworkError: connection timeout
```
**Fix:** Whitelist your IP in MongoDB Atlas Network Access

---

## 🎯 Next Steps

1. ✅ **Test the backend** locally
2. ✅ **Deploy to Vercel**
3. ✅ **Update Flutter app** to send `deviceId` and `rssi`
4. 🔜 **Implement device ID generation** in Flutter
5. 🔜 **Add continuous RSSI streaming**
6. 🔜 **Build Python analysis script** for co-location detection

---

## 📞 Support

If you encounter issues:
1. Check server logs: `npm run dev`
2. Verify MongoDB connection in Atlas
3. Test endpoints with curl/Postman
4. Check Vercel logs if deployed

Ready to proceed? Let's implement device ID generation in the Flutter app next! 🚀
