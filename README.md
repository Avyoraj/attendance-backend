# 🎓 Attendance Backend - MongoDB Edition

> Production-ready attendance system with device locking, two-step verification, and co-location anomaly detection.

## 🚀 Features

- ✅ **MongoDB Database** - Scalable, cloud-ready storage
- ✅ **Device ID Locking** - Prevent proxy attendance
- ✅ **Two-Step Attendance** - Provisional → Confirmed workflow
- ✅ **RSSI Streaming** - Time-series data for analysis
- ✅ **Anomaly Detection** - Co-location flagging support
- ✅ **Auto-Registration** - Students created on first check-in
- ✅ **Backward Compatible** - Works with existing Flutter app
- ✅ **Vercel Ready** - Serverless deployment support

---

## 📦 Quick Start

### 1. Install

```bash
npm install
```

### 2. Configure

Create `.env` file:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/attendance_system
DATABASE_NAME=attendance_system
PORT=3000
```

### 3. Run

```bash
npm run dev
```

Visit: http://localhost:3000

---

## 📡 API Endpoints

### Attendance

```bash
# Check-in (creates student if new)
POST /api/check-in
{
  "studentId": "S001",
  "classId": "CS101",
  "deviceId": "unique-device-id",
  "rssi": -65,
  "distance": 2.5
}

# Confirm attendance
POST /api/attendance/confirm
{
  "studentId": "S001",
  "classId": "CS101"
}

# Get records
GET /api/attendance?studentId=S001&status=confirmed
```

### RSSI Streaming

```bash
# Upload RSSI data
POST /api/check-in/stream
{
  "studentId": "S001",
  "classId": "CS101",
  "rssiData": [
    {"timestamp": "2025-10-14T10:00:00Z", "rssi": -65},
    {"timestamp": "2025-10-14T10:00:05Z", "rssi": -67}
  ]
}

# Get streams
GET /api/rssi-streams?classId=CS101&date=2025-10-14
```

### Anomalies

```bash
# Get anomalies
GET /api/anomalies?status=pending

# Create anomaly (from analysis script)
POST /api/anomalies
{
  "classId": "CS101",
  "sessionDate": "2025-10-14",
  "flaggedUsers": ["S001", "S002"],
  "correlationScore": 0.97,
  "severity": "high"
}
```

### Students

```bash
# Register device
POST /api/students/register
{
  "studentId": "S001",
  "name": "John Doe",
  "deviceId": "unique-device-id"
}

# Get student
GET /api/students/S001
```

---

## 📊 Database Schema

### Students Collection

```javascript
{
  _id: ObjectId,
  studentId: String (unique, indexed),
  name: String,
  email: String,
  deviceId: String (unique),
  deviceRegisteredAt: Date,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Attendances Collection

```javascript
{
  _id: ObjectId,
  studentId: String (indexed),
  classId: String (indexed),
  deviceId: String,
  status: "provisional" | "confirmed" | "left_early",
  checkInTime: Date,
  confirmedAt: Date,
  rssi: Number,
  distance: Number,
  sessionDate: Date (indexed),
  beaconMajor: Number,
  beaconMinor: Number,
  createdAt: Date
}
```

### RSSI Streams Collection

```javascript
{
  _id: ObjectId,
  studentId: String,
  classId: String,
  sessionDate: Date,
  rssiData: [
    {
      timestamp: Date,
      rssi: Number,
      distance: Number
    }
  ],
  startedAt: Date,
  completedAt: Date,
  totalReadings: Number,
  createdAt: Date
}
```

### Anomaly Flags Collection

```javascript
{
  _id: ObjectId,
  classId: String,
  sessionDate: Date,
  flaggedUsers: [String],
  correlationScore: Number,
  severity: "low" | "medium" | "high" | "critical",
  status: "pending" | "reviewed" | "confirmed" | "dismissed",
  reviewedBy: String,
  reviewedAt: Date,
  reviewNotes: String,
  detectedAt: Date,
  analysisMethod: String,
  createdAt: Date
}
```

---

## 🔒 Device Locking Logic

1. **First Check-in**: Student registers with `deviceId`
2. **Subsequent Check-ins**: Server validates `deviceId` matches
3. **Device Mismatch**: Returns `403` error
4. **Benefit**: One student = one device forever

---

## 📈 Two-Step Attendance Flow

1. **Initial Check-in**: Status = `provisional`
2. **After 10-15 min**: Flutter app calls `/api/attendance/confirm`
3. **Status Updated**: `provisional` → `confirmed`
4. **Early Leave**: If not confirmed, stays `provisional` or marked `left_early`

---

## 📡 RSSI Streaming for Co-Location

1. **Flutter App**: Scans beacon every 5s for 15 minutes
2. **Batch Upload**: Sends 180 readings to `/api/check-in/stream`
3. **Storage**: Saved in `rssistreams` collection
4. **Analysis**: Python script fetches data, calculates correlations
5. **Flagging**: High correlation pairs saved to `anomalyflags`

---

## 🌐 Deployment

### Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Configure MongoDB URI in Vercel dashboard
3. Deploy: `vercel --prod`

### Environment Variables (Vercel)

```
MONGODB_URI=mongodb+srv://...
DATABASE_NAME=attendance_system
```

---

## 🧪 Testing

```bash
# Health check
curl http://localhost:3000/api/health

# Test check-in
curl -X POST http://localhost:3000/api/check-in \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "TEST001",
    "classId": "CS101",
    "deviceId": "test-device-123",
    "rssi": -65,
    "distance": 2.5
  }'

# Get attendance
curl "http://localhost:3000/api/attendance?studentId=TEST001"

# Confirm attendance
curl -X POST http://localhost:3000/api/attendance/confirm \
  -H "Content-Type: application/json" \
  -d '{"studentId": "TEST001", "classId": "CS101"}'
```

---

## 📊 Dashboard

Visit `http://localhost:3000` for the web dashboard with:
- Real-time attendance monitoring
- Status filtering (provisional/confirmed)
- RSSI signal strength indicators
- Device lock status
- Auto-refresh every 10 seconds

---

## 🔧 Development

```bash
# Run with auto-reload
npm run dev

# Production
npm start
```

---

## 📖 Documentation

- [MongoDB Migration Guide](./MONGODB_MIGRATION_GUIDE.md)
- [API Documentation](#-api-endpoints)
- [Schema Reference](#-database-schema)

---

## 🎯 Next Steps

1. ✅ Backend migrated to MongoDB
2. 🔜 Add device ID generation in Flutter
3. 🔜 Implement continuous RSSI streaming
4. 🔜 Build Python analysis script
5. 🔜 Create admin dashboard for anomalies

---

## 📞 Support

For issues:
1. Check MongoDB connection in `.env`
2. Verify collections created (check MongoDB Atlas)
3. Test endpoints with curl
4. Check server logs: `npm run dev`

---

**Made with ❤️ for frictionless attendance tracking**
