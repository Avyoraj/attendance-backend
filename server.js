const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import models
const Student = require('./models/Student');
const Attendance = require('./models/Attendance');
const RSSIStream = require('./models/RSSIStream');
const AnomalyFlag = require('./models/AnomalyFlag');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
let isConnected = false;

const connectToMongoDB = async () => {
  if (isConnected) {
    console.log('✅ Using existing MongoDB connection');
    return;
  }

  try {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log('🚀 Connected to MongoDB successfully!');
    console.log('📊 Database:', mongoose.connection.db.databaseName);

    // Log collection stats
    const studentCount = await Student.countDocuments();
    const attendanceCount = await Attendance.countDocuments();
    
    console.log('📊 Database Stats:');
    console.log(`   - Students: ${studentCount}`);
    console.log(`   - Attendance Records: ${attendanceCount}`);

    // ✅ Ensure unique index on deviceId (sparse = allows multiple nulls)
    await Student.collection.createIndex(
      { deviceId: 1 }, 
      { 
        unique: true, 
        sparse: true, // Allows multiple null values
        name: 'deviceId_unique_idx' 
      }
    );
    console.log('✅ Device uniqueness index ensured');

  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    isConnected = false;
    throw error;
  }
};

// Middleware to ensure DB connection
const ensureConnection = async (req, res, next) => {
  try {
    if (!isConnected) {
      await connectToMongoDB();
    }
    next();
  } catch (error) {
    res.status(500).json({ 
      error: 'Database connection failed',
      details: error.message 
    });
  }
};

// Apply to all routes
app.use(ensureConnection);

// ==========================================
// 📍 CORE ENDPOINTS (Compatible with Flutter)
// ==========================================

/**
 * POST /api/validate-device
 * Validate device BEFORE login (prevents locked users from accessing app)
 * Returns: { canLogin: boolean, error?: string, lockedToStudent?: string }
 */
app.post('/api/validate-device', async (req, res) => {
  try {
    const { studentId, deviceId } = req.body;

    // Validation
    if (!studentId || !deviceId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['studentId', 'deviceId']
      });
    }

    console.log(`🔐 VALIDATING LOGIN: Student ${studentId} on device ${deviceId.substring(0, 8)}...`);

    // Check if this device is already registered to ANY student
    const existingDeviceUser = await Student.findOne({ deviceId });
    
    if (existingDeviceUser) {
      if (existingDeviceUser.studentId !== studentId) {
        // Device is locked to DIFFERENT student - BLOCK LOGIN
        console.log(`❌ LOGIN BLOCKED: Device locked to student ${existingDeviceUser.studentId}`);
        return res.status(403).json({
          canLogin: false,
          error: 'Device already registered',
          message: `This device is already linked to student ID: ${existingDeviceUser.studentId}`,
          lockedToStudent: existingDeviceUser.studentId,
          lockedSince: existingDeviceUser.deviceRegisteredAt
        });
      } else {
        // Device is registered to THIS student - ALLOW LOGIN
        console.log(`✅ LOGIN ALLOWED: Device verified for student ${studentId}`);
        return res.status(200).json({
          canLogin: true,
          message: 'Welcome back!'
        });
      }
    } else {
      // Device is NOT registered to anyone - ALLOW LOGIN
      console.log(`✅ LOGIN ALLOWED: New device for student ${studentId}`);
      return res.status(200).json({
        canLogin: true,
        message: 'Device will be registered on first check-in'
      });
    }

  } catch (error) {
    console.error('❌ Device validation error:', error);
    res.status(500).json({ 
      error: 'Device validation failed',
      details: error.message 
    });
  }
});

// ==========================================
// ATTENDANCE ENDPOINTS
// ==========================================

/**
 * POST /api/check-in
 * Main attendance check-in endpoint
 * Compatible with existing Flutter app
 */
app.post('/api/check-in', async (req, res) => {
  try {
    const { studentId, classId, deviceId, rssi, distance, beaconMajor, beaconMinor } = req.body;

    // Validation
    if (!studentId || !classId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['studentId', 'classId']
      });
    }

    // Get today's date (for uniqueness check)
    const today = new Date();
    const sessionDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // ✅ CRITICAL: Check device FIRST (before student creation)
    if (deviceId) {
      console.log(`🔍 Checking device availability: ${deviceId.substring(0, 8)}... for student ${studentId}`);
      
      // Check if this device is already registered to ANY student (including this one)
      const existingDeviceUser = await Student.findOne({ deviceId });
      
      if (existingDeviceUser) {
        // Device is already registered
        if (existingDeviceUser.studentId !== studentId) {
          // Registered to DIFFERENT student - BLOCK
          console.log(`❌ BLOCKED: Device ${deviceId.substring(0, 8)}... is locked to student ${existingDeviceUser.studentId}`);
          return res.status(403).json({
            error: 'Device already registered',
            message: `This device is already linked to another student account (${existingDeviceUser.studentId})`,
            lockedToStudent: existingDeviceUser.studentId,
            lockedSince: existingDeviceUser.deviceRegisteredAt
          });
        } else {
          // Registered to THIS student - OK, continue
          console.log(`✅ Device verified for student ${studentId}`);
        }
      } else {
        console.log(`✅ Device ${deviceId.substring(0, 8)}... is available`);
      }
    }

    // Now safe to get/create student
    let student = await Student.findOne({ studentId });
    
    if (!student) {
      // New student - register device immediately
      student = new Student({
        studentId,
        name: `Student ${studentId}`,
        deviceId: deviceId || null,
        deviceRegisteredAt: deviceId ? new Date() : null
      });
      await student.save();
      console.log(`✨ Created new student: ${studentId} with device ${deviceId ? deviceId.substring(0, 8) + '...' : 'none'}`);
    } else if (!student.deviceId && deviceId) {
      // Existing student without device - register it now
      student.deviceId = deviceId;
      student.deviceRegisteredAt = new Date();
      await student.save();
      console.log(`🔒 Device ${deviceId.substring(0, 8)}... registered for existing student: ${studentId}`);
    }

    // Final verification: ensure device matches
    if (student.deviceId && deviceId && student.deviceId !== deviceId) {
      console.log(`❌ Device mismatch: Expected ${student.deviceId.substring(0, 8)}..., got ${deviceId.substring(0, 8)}...`);
      return res.status(403).json({
        error: 'Device mismatch',
        message: 'This account is linked to a different device'
      });
    }

    // Check for existing attendance today
    let attendance = await Attendance.findOne({
      studentId,
      classId,
      sessionDate
    });

    if (attendance) {
      // Update existing record (for confirmation or RSSI update)
      attendance.rssi = rssi || attendance.rssi;
      attendance.distance = distance || attendance.distance;
      
      if (attendance.status === 'provisional' && req.body.confirm === true) {
        attendance.status = 'confirmed';
        attendance.confirmedAt = new Date();
      }
      
      await attendance.save();
      
      return res.status(200).json({
        message: 'Attendance updated',
        status: attendance.status,
        alreadyMarked: true,
        attendance: {
          id: attendance._id,
          status: attendance.status,
          checkInTime: attendance.checkInTime,
          confirmedAt: attendance.confirmedAt
        }
      });
    }

    // Create new attendance record
    attendance = new Attendance({
      studentId,
      classId,
      deviceId: deviceId || student.deviceId,
      status: 'provisional', // Start as provisional
      rssi: rssi || -70, // Default if not provided
      distance: distance || null,
      beaconMajor: beaconMajor || null,
      beaconMinor: beaconMinor || null,
      sessionDate
    });

    await attendance.save();

    console.log(`✅ Attendance marked: ${studentId} in ${classId} (${attendance.status})`);

    res.status(201).json({
      message: 'Attendance recorded successfully',
      status: 'provisional',
      attendance: {
        id: attendance._id,
        studentId: attendance.studentId,
        classId: attendance.classId,
        status: attendance.status,
        checkInTime: attendance.checkInTime,
        rssi: attendance.rssi
      }
    });

  } catch (error) {
    console.error('❌ Check-in error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Duplicate attendance',
        message: 'Attendance already marked for this class today'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to record attendance',
      details: error.message 
    });
  }
});

/**
 * POST /api/attendance/confirm
 * Confirm provisional attendance (for Two-Step Attendance)
 */
app.post('/api/attendance/confirm', async (req, res) => {
  try {
    const { studentId, classId } = req.body;

    if (!studentId || !classId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['studentId', 'classId']
      });
    }

    const today = new Date();
    const sessionDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const attendance = await Attendance.findOne({
      studentId,
      classId,
      sessionDate,
      status: 'provisional'
    });

    if (!attendance) {
      return res.status(404).json({
        error: 'No provisional attendance found',
        message: 'Cannot confirm attendance that does not exist or is already confirmed'
      });
    }

    attendance.status = 'confirmed';
    attendance.confirmedAt = new Date();
    await attendance.save();

    res.status(200).json({
      message: 'Attendance confirmed successfully',
      attendance: {
        id: attendance._id,
        status: attendance.status,
        checkInTime: attendance.checkInTime,
        confirmedAt: attendance.confirmedAt
      }
    });

  } catch (error) {
    console.error('❌ Confirmation error:', error);
    res.status(500).json({ 
      error: 'Failed to confirm attendance',
      details: error.message 
    });
  }
});

/**
 * POST /api/attendance/cancel-provisional
 * Cancel provisional attendance (student left before confirmation)
 * CRITICAL: This prevents false attendance when student leaves early
 */
app.post('/api/attendance/cancel-provisional', async (req, res) => {
  try {
    const { studentId, classId } = req.body;

    if (!studentId || !classId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['studentId', 'classId']
      });
    }

    const today = new Date();
    const sessionDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Delete provisional attendance only (not confirmed ones)
    const result = await Attendance.findOneAndDelete({
      studentId,
      classId,
      sessionDate,
      status: 'provisional'
    });

    if (!result) {
      return res.status(404).json({
        error: 'No provisional attendance found',
        message: 'Cannot cancel attendance that does not exist or is already confirmed'
      });
    }

    console.log(`🚫 Cancelled provisional attendance for ${studentId} in ${classId} (left before confirmation)`);

    res.status(200).json({
      message: 'Provisional attendance cancelled successfully',
      reason: 'Student left classroom before confirmation period ended (out of beacon range)',
      cancelled: {
        studentId: result.studentId,
        classId: result.classId,
        checkInTime: result.checkInTime,
        sessionDate: result.sessionDate
      }
    });

  } catch (error) {
    console.error('❌ Cancellation error:', error);
    res.status(500).json({ 
      error: 'Failed to cancel provisional attendance',
      details: error.message 
    });
  }
});

/**
 * GET /api/attendance/today/:studentId
 * Get today's attendance status for a specific student (all classes)
 * Used for: App state synchronization on startup/login
 * Returns: Array of today's attendance records with status and timing
 */
app.get('/api/attendance/today/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!studentId) {
      return res.status(400).json({ 
        error: 'Missing studentId parameter'
      });
    }

    const today = new Date();
    const sessionDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Find all attendance records for today
    const attendanceRecords = await Attendance.find({
      studentId,
      sessionDate
    }).sort({ checkInTime: -1 }); // Most recent first

    // Calculate remaining time for provisional records
    const enrichedRecords = attendanceRecords.map(record => {
      const result = {
        attendanceId: record._id,
        studentId: record.studentId,
        classId: record.classId,
        status: record.status,
        checkInTime: record.checkInTime,
        confirmedAt: record.confirmedAt,
        sessionDate: record.sessionDate
      };

      // For provisional records, calculate remaining confirmation time
      if (record.status === 'provisional' && record.checkInTime) {
        const now = new Date();
        const checkInTime = new Date(record.checkInTime);
        const elapsedMs = now - checkInTime;
        const confirmationDelayMs = 3 * 60 * 1000; // 3 minutes (matches app constant)
        const remainingMs = confirmationDelayMs - elapsedMs;
        
        result.elapsedSeconds = Math.floor(elapsedMs / 1000);
        result.remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
        result.shouldConfirm = remainingMs <= 0; // Backend should confirm this
      }

      return result;
    });

    console.log(`📊 Today's attendance for ${studentId}: ${enrichedRecords.length} records`);

    res.status(200).json({
      studentId,
      date: sessionDate,
      count: enrichedRecords.length,
      attendance: enrichedRecords
    });

  } catch (error) {
    console.error('❌ Get today attendance error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch today\'s attendance',
      details: error.message 
    });
  }
});

/**
 * GET /api/attendance
 * Get attendance records (for dashboard)
 */
app.get('/api/attendance', async (req, res) => {
  try {
    const { studentId, classId, date, status, limit = 100 } = req.query;

    const query = {};
    
    if (studentId) query.studentId = studentId;
    if (classId) query.classId = classId;
    if (status) query.status = status;
    
    if (date) {
      const queryDate = new Date(date);
      const sessionDate = new Date(queryDate.getFullYear(), queryDate.getMonth(), queryDate.getDate());
      query.sessionDate = sessionDate;
    }

    const attendance = await Attendance
      .find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      count: attendance.length,
      attendance
    });

  } catch (error) {
    console.error('❌ Get attendance error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch attendance',
      details: error.message 
    });
  }
});

// ==========================================
// 📊 RSSI STREAMING (Co-Location Detection)
// ==========================================

/**
 * POST /api/check-in/stream
 * Stream RSSI data for co-location analysis
 */
app.post('/api/check-in/stream', async (req, res) => {
  try {
    const { studentId, classId, rssiData } = req.body;

    if (!studentId || !classId || !rssiData || !Array.isArray(rssiData)) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['studentId', 'classId', 'rssiData (array)']
      });
    }

    const today = new Date();
    const sessionDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Find or create RSSI stream
    let stream = await RSSIStream.findOne({
      studentId,
      classId,
      sessionDate
    });

    if (stream) {
      // Append new data
      stream.rssiData.push(...rssiData);
      stream.completedAt = new Date();
    } else {
      // Create new stream
      stream = new RSSIStream({
        studentId,
        classId,
        sessionDate,
        rssiData
      });
    }

    await stream.save();

    console.log(`📡 RSSI stream updated: ${studentId} in ${classId} (${stream.totalReadings} readings)`);

    res.status(200).json({
      message: 'RSSI data recorded',
      totalReadings: stream.totalReadings,
      streamId: stream._id
    });

  } catch (error) {
    console.error('❌ RSSI stream error:', error);
    res.status(500).json({ 
      error: 'Failed to record RSSI data',
      details: error.message 
    });
  }
});

/**
 * GET /api/rssi-streams
 * Get RSSI streams for analysis
 */
app.get('/api/rssi-streams', async (req, res) => {
  try {
    const { classId, date } = req.query;

    const query = {};
    
    if (classId) query.classId = classId;
    
    if (date) {
      const queryDate = new Date(date);
      const sessionDate = new Date(queryDate.getFullYear(), queryDate.getMonth(), queryDate.getDate());
      query.sessionDate = sessionDate;
    }

    const streams = await RSSIStream.find(query);

    res.status(200).json({
      count: streams.length,
      streams
    });

  } catch (error) {
    console.error('❌ Get RSSI streams error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch RSSI streams',
      details: error.message 
    });
  }
});

// ==========================================
// 🚨 ANOMALY DETECTION
// ==========================================

/**
 * GET /api/anomalies
 * Get detected anomalies
 */
app.get('/api/anomalies', async (req, res) => {
  try {
    const { classId, status, limit = 50 } = req.query;

    const query = {};
    
    if (classId) query.classId = classId;
    if (status) query.status = status;

    const anomalies = await AnomalyFlag
      .find(query)
      .sort({ detectedAt: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      count: anomalies.length,
      anomalies
    });

  } catch (error) {
    console.error('❌ Get anomalies error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch anomalies',
      details: error.message 
    });
  }
});

/**
 * POST /api/anomalies
 * Create anomaly flag (called by analysis script)
 */
app.post('/api/anomalies', async (req, res) => {
  try {
    const { classId, sessionDate, flaggedUsers, correlationScore, severity } = req.body;

    if (!classId || !sessionDate || !flaggedUsers || correlationScore === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['classId', 'sessionDate', 'flaggedUsers', 'correlationScore']
      });
    }

    const anomaly = new AnomalyFlag({
      classId,
      sessionDate: new Date(sessionDate),
      flaggedUsers,
      correlationScore,
      severity: severity || 'medium'
    });

    await anomaly.save();

    console.log(`🚨 Anomaly flagged: ${flaggedUsers.join(', ')} in ${classId} (correlation: ${correlationScore})`);

    res.status(201).json({
      message: 'Anomaly recorded',
      anomaly
    });

  } catch (error) {
    console.error('❌ Create anomaly error:', error);
    res.status(500).json({ 
      error: 'Failed to record anomaly',
      details: error.message 
    });
  }
});

// ==========================================
// 👤 STUDENT MANAGEMENT
// ==========================================

/**
 * POST /api/students/register
 * Register device for student
 */
app.post('/api/students/register', async (req, res) => {
  try {
    const { studentId, name, email, deviceId } = req.body;

    if (!studentId || !deviceId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['studentId', 'deviceId']
      });
    }

    let student = await Student.findOne({ studentId });

    if (student) {
      // Update existing student
      if (student.deviceId && student.deviceId !== deviceId) {
        return res.status(403).json({
          error: 'Device already registered',
          message: 'This student account is linked to a different device'
        });
      }
      
      student.deviceId = deviceId;
      student.deviceRegisteredAt = new Date();
      if (name) student.name = name;
      if (email) student.email = email;
      
    } else {
      // Create new student
      student = new Student({
        studentId,
        name: name || `Student ${studentId}`,
        email,
        deviceId,
        deviceRegisteredAt: new Date()
      });
    }

    await student.save();

    res.status(200).json({
      message: 'Student registered successfully',
      student: {
        studentId: student.studentId,
        name: student.name,
        deviceRegistered: !!student.deviceId
      }
    });

  } catch (error) {
    console.error('❌ Student registration error:', error);
    res.status(500).json({ 
      error: 'Failed to register student',
      details: error.message 
    });
  }
});

/**
 * GET /api/students/:studentId
 * Get student info
 */
app.get('/api/students/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findOne({ studentId });

    if (!student) {
      return res.status(404).json({
        error: 'Student not found'
      });
    }

    res.status(200).json({
      student: {
        studentId: student.studentId,
        name: student.name,
        email: student.email,
        deviceRegistered: !!student.deviceId,
        isActive: student.isActive,
        createdAt: student.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Get student error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch student',
      details: error.message 
    });
  }
});

// ==========================================
// 🏥 HEALTH CHECK
// ==========================================

app.get('/api/health', async (req, res) => {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    
    res.status(200).json({
      status: 'ok',
      database: isDbConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ==========================================
// 🚀 SERVER STARTUP
// ==========================================

// Vercel export
module.exports = app;

// Local development
if (process.env.VERCEL_ENV !== 'production') {
  const port = process.env.PORT || 3000;
  
  connectToMongoDB()
    .then(() => {
      app.listen(port, () => {
        console.log(`🚀 Server running on http://localhost:${port}`);
        console.log(`📡 API Endpoints:`);
        console.log(`   - POST /api/check-in`);
        console.log(`   - POST /api/attendance/confirm`);
        console.log(`   - GET  /api/attendance`);
        console.log(`   - POST /api/check-in/stream`);
        console.log(`   - GET  /api/anomalies`);
        console.log(`   - POST /api/students/register`);
        console.log(`   - GET  /api/health`);
      });
    })
    .catch((error) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
}