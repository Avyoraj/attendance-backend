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

const app = express();

// ==========================================
// 🔒 SECURITY & MIDDLEWARE
// ==========================================

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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
app.use('/api/validate-device', studentRoutes);

// Attendance routes
app.use('/api/attendance', attendanceRoutes);
app.use('/api/check-in', attendanceRoutes);

// RSSI routes
app.use('/api/check-in', rssiRoutes);
app.use('/api/rssi-streams', rssiRoutes);

// Anomaly routes
app.use('/api/anomalies', anomalyRoutes);

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
