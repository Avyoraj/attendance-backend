/**
 * 🚀 Attendance System Backend Server (Refactored)
 * 
 * Clean, modular architecture with:
 * - Routes: Endpoint definitions
 * - Controllers: Business logic
 * - Services: Reusable utilities (correlation, anomaly)
 * - Models: Database schemas
 * - Middleware: Auth, validation
 * 
 * Original: 1623 lines → Refactored: ~150 lines
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

// Database connection
const { connectToMongoDB, ensureConnection } = require('./utils/database');

// Import models (for cleanup jobs)
const Student = require('./models/Student');
const Attendance = require('./models/Attendance');

// Routes
const studentRoutes = require('./routes/student.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const rssiRoutes = require('./routes/rssi.routes');
const anomalyRoutes = require('./routes/anomaly.routes');
const reportsRoutes = require('./routes/reports.routes');

const app = express();

// ==========================================
// 🔒 SECURITY & MIDDLEWARE
// ==========================================

app.use(helmet());
app.use(cors());
app.use(express.json());
// Serve static assets at both / and /public for compatibility (local and Vercel)
app.use(express.static('public'));
app.use('/public', express.static('public'));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many login attempts, please try again later.'
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.'
});

// Apply connection middleware to all routes
app.use(ensureConnection);

// ==========================================
// 📍 API ROUTES
// ==========================================

// Student routes
app.use('/api/students', studentRoutes);

// Device validation (special route - used by Flutter app)
app.post('/api/validate-device', require('./controllers/student.controller').validateDevice);

// Check-in routes (special routes - used by Flutter app)
app.post('/api/check-in', require('./controllers/attendance.controller').checkIn);
app.post('/api/check-in/stream', require('./controllers/rssi.controller').uploadStream);

// Attendance management routes (special routes - match Flutter app paths)
app.post('/api/attendance/confirm', require('./controllers/attendance.controller').confirmAttendance);
app.post('/api/attendance/cancel-provisional', require('./controllers/attendance.controller').cancelProvisional);
// Alias for RSSI stream under attendance namespace (keeps old path too)
app.post('/api/attendance/rssi-stream', require('./controllers/rssi.controller').uploadStream);

// Attendance query routes
app.use('/api/attendance', attendanceRoutes);

// RSSI routes
app.use('/api/rssi-streams', rssiRoutes);
app.post('/api/analyze', require('./controllers/rssi.controller').analyzeCorrelations);

// Anomaly routes
app.use('/api/anomalies', anomalyRoutes);

// Reports routes
app.use('/api/reports', reportsRoutes);

// ==========================================
// 🏥 HEALTH CHECK
// ==========================================

app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    const studentCount = await Student.countDocuments();
    const attendanceCount = await Attendance.countDocuments();

    res.status(200).json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
      stats: {
        students: studentCount,
        attendanceRecords: attendanceCount
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Dashboard (root route)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// 🧹 AUTOMATIC CLEANUP JOBS
// ==========================================

/**
 * Cleanup expired provisional attendance records
 * Runs every 5 minutes
 */
function startProvisionalCleanup() {
  console.log('🧹 Starting automatic provisional cleanup service...');
  
  cleanupExpiredProvisional();
  setInterval(cleanupExpiredProvisional, 5 * 60 * 1000);
}

async function cleanupExpiredProvisional() {
  try {
    const now = new Date();
    const confirmationWindowMs = 3 * 60 * 1000; // 3 minutes
    const classDurationMs = 60 * 60 * 1000; // 1 hour
    const expiryTime = new Date(now - confirmationWindowMs);
    
    // Mark expired provisionals as cancelled
    const expiredProvisionals = await Attendance.find({
      status: 'provisional',
      checkInTime: { $lt: expiryTime }
    });
    
    if (expiredProvisionals.length > 0) {
      for (const record of expiredProvisionals) {
        const elapsedMinutes = Math.floor((now - record.checkInTime) / 1000 / 60);
        
        record.status = 'cancelled';
        record.cancelledAt = now;
        record.cancellationReason = `Auto-cancelled: Provisional period expired after ${elapsedMinutes} minutes`;
        await record.save();
      }
      
      console.log(`✅ Marked ${expiredProvisionals.length} records as cancelled`);
    }
    
    // Delete old cancelled records (after class ended)
    const classEndTime = new Date(now - classDurationMs);
    const oldCancelledRecords = await Attendance.find({
      status: 'cancelled',
      checkInTime: { $lt: classEndTime }
    });
    
    if (oldCancelledRecords.length > 0) {
      for (const record of oldCancelledRecords) {
        await Attendance.deleteOne({ _id: record._id });
      }
      
      console.log(`✅ Deleted ${oldCancelledRecords.length} old cancelled records`);
    }

  } catch (error) {
    console.error('❌ Cleanup error:', error.message);
  }
}

// ==========================================
// 🚀 SERVER STARTUP
// ==========================================

const PORT = process.env.PORT || 3000;

// For Vercel serverless deployment, export app directly
if (process.env.VERCEL) {
  console.log('🔧 Running in Vercel serverless mode');
  module.exports = app;
} else {
  // For local development, start traditional server
  async function startServer() {
    try {
      // Connect to MongoDB
      await connectToMongoDB();
      
      // Ensure indexes
      await Student.collection.createIndex(
        { deviceId: 1 }, 
        { unique: true, sparse: true, name: 'deviceId_unique_idx' }
      );
      console.log('✅ Device uniqueness index ensured');
      
      // Start cleanup jobs
      startProvisionalCleanup();

      // Schedule correlation analysis (every 30 minutes, 8:00–20:00 daily)
      try {
        cron.schedule('0,30 8-20 * * *', async () => {
          try {
            console.log('⏱️  Running scheduled correlation analysis...');
            // Lazy import to avoid startup overhead
            const { analyzeCorrelations } = require('./scripts/analyze-correlations');
            await analyzeCorrelations();
          } catch (err) {
            console.error('❌ Scheduled correlation run failed:', err.message);
          }
        }, {
          timezone: 'Etc/UTC'
        });
        console.log('✅ Scheduled correlation analysis job (every 30 min, 08:00–20:00 UTC)');
      } catch (e) {
        console.error('⚠️ Failed to schedule correlation job:', e.message);
      }
      
      // Start server
      app.listen(PORT, () => {
        console.log('\n' + '='.repeat(60));
        console.log('🚀 ATTENDANCE SYSTEM BACKEND - RUNNING');
        console.log('='.repeat(60));
        console.log(`📡 Server: http://localhost:${PORT}`);
        console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
        console.log(`📊 Dashboard: http://localhost:${PORT}/`);
        console.log('='.repeat(60) + '\n');
      });

    } catch (error) {
      console.error('💥 Failed to start server:', error);
      process.exit(1);
    }
  }

  // Start the server
  startServer();

  // Export for testing
  module.exports = app;
}
