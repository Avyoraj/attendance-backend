/**
 * DEPRECATED FILE: server-old.js
 * ------------------------------------------------------------
 * This legacy monolithic Express server implementation has been
 * superseded by the refactored modular server (server.js and the
 * controllers/, routes/, services/ structure).
 *
 * It has intentionally been reduced to this stub because direct
 * deletion via the automated patch tooling was unsuccessful in
 * this environment. Retaining a tiny stub avoids accidental
 * resurrection of outdated logic while keeping version control
 * history intact for archeology.
 *
 * ACTION: Remove this file entirely in a subsequent commit once
 * filesystem constraints allow, and ensure any references in docs
 * are updated (e.g. CLEANUP_AND_FOLDER_STRUCTURE.md, ISSUES_BREAKDOWN.md).
 */

console.warn('[server-old.js] This legacy file is deprecated and contains no runtime logic. Use server.js instead.');

module.exports = {}; // No-op export.

if (false) {
// LEGACY BELOW IS DISABLED - kept for archeology
// ------------------------------------------------

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
    
    // 🎯 NEW: Start automatic cleanup of expired provisional records
    startProvisionalCleanup();

  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    isConnected = false;
    throw error;
  }
};

// 🎯 NEW: Automatic cleanup of expired provisional attendance records
// Runs every 5 minutes to cancel provisional records that exceeded the confirmation window
function startProvisionalCleanup() {
  console.log('🧹 Starting automatic provisional cleanup service...');
  
  // Run immediately on startup
  cleanupExpiredProvisional();
  
  // Then run every 5 minutes
  setInterval(cleanupExpiredProvisional, 5 * 60 * 1000);
}

async function cleanupExpiredProvisional() {
  try {
    const now = new Date();
    const confirmationWindowMs = 3 * 60 * 1000; // 3 minutes
    const classDurationMs = 60 * 60 * 1000; // 1 hour (class duration)
    const expiryTime = new Date(now - confirmationWindowMs);
    
    // 1️⃣ Find and UPDATE provisional records older than 3 minutes → cancelled
    const expiredProvisionals = await Attendance.find({
      status: 'provisional',
      checkInTime: { $lt: expiryTime }
    });
    
    if (expiredProvisionals.length > 0) {
      console.log(`🧹 Found ${expiredProvisionals.length} expired provisional records`);
      
      // Mark as cancelled (keep for class duration)
      for (const record of expiredProvisionals) {
        const elapsedMinutes = Math.floor((now - record.checkInTime) / 1000 / 60);
        
        console.log(`   ❌ Marking as cancelled: Student ${record.studentId}, Class ${record.classId}`);
        console.log(`      Reason: Expired after ${elapsedMinutes} minutes (limit: 3 min)`);
        console.log(`      Action: Keeping for class duration (1 hour from check-in)`);
        
        // Update to cancelled (don't delete yet)
        record.status = 'cancelled';
        record.cancelledAt = now;
        record.cancellationReason = `Auto-cancelled: Provisional period expired after ${elapsedMinutes} minutes without confirmation`;
        await record.save();
      }
      
      console.log(`✅ Marked ${expiredProvisionals.length} records as cancelled`);
    }
    
    // 2️⃣ Find and DELETE cancelled records older than 1 hour (class ended)
    const classEndTime = new Date(now - classDurationMs);
    const oldCancelledRecords = await Attendance.find({
      status: 'cancelled',
      checkInTime: { $lt: classEndTime }
    });
    
    if (oldCancelledRecords.length > 0) {
      console.log(`🗑️ Found ${oldCancelledRecords.length} old cancelled records (class ended)`);
      
      for (const record of oldCancelledRecords) {
        const elapsedMinutes = Math.floor((now - record.checkInTime) / 1000 / 60);
        
        console.log(`   🗑️ Deleting old cancelled: Student ${record.studentId}, Class ${record.classId}`);
        console.log(`      Reason: Class ended (${elapsedMinutes} minutes ago)`);
        
        await Attendance.deleteOne({ _id: record._id });
      }
      
      console.log(`✅ Deleted ${oldCancelledRecords.length} old cancelled records`);
    }
    
    // Log only occasionally if nothing to clean
    if (expiredProvisionals.length === 0 && oldCancelledRecords.length === 0) {
      if (Math.random() < 0.1) {
        console.log('🧹 Cleanup check: No expired records found');
      }
    }
  } catch (error) {
    console.error('❌ Error during provisional cleanup:', error.message);
  }
}

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
// � AUTHENTICATION ENDPOINTS
// ==========================================

/**
 * POST /api/teachers/register
 * Register a new teacher account
 */
app.post('/api/teachers/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, department } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Password strength
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if teacher already exists
    const existingTeacher = await Teacher.findOne({ email: email.toLowerCase() });
    if (existingTeacher) {
      return res.status(409).json({
        success: false,
        message: 'Teacher with this email already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create teacher
    const teacher = new Teacher({
      name,
      email: email.toLowerCase(),
      password_hash,
      department: department || 'General',
      isVerified: false, // Can be verified by admin later
      isActive: true
    });

    await teacher.save();

    // Generate JWT token
    const token = jwt.sign(
      { id: teacher._id, email: teacher.email, role: 'teacher' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    console.log(`✅ Teacher registered: ${teacher.email}`);

    res.status(201).json({
      success: true,
      message: 'Teacher registered successfully',
      data: {
        token,
        teacher: {
          id: teacher._id,
          name: teacher.name,
          email: teacher.email,
          department: teacher.department,
          isVerified: teacher.isVerified
        }
      }
    });

  } catch (error) {
    console.error('Teacher registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.',
      error: error.message
    });
  }
});

/**
 * POST /api/teachers/login
 * Teacher login endpoint
 */
app.post('/api/teachers/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find teacher
    const teacher = await Teacher.findOne({ email: email.toLowerCase() });
    if (!teacher) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if active
    if (!teacher.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact admin.'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, teacher.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: teacher._id, email: teacher.email, role: 'teacher' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    console.log(`✅ Teacher logged in: ${teacher.email}`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        teacher: {
          id: teacher._id,
          name: teacher.name,
          email: teacher.email,
          department: teacher.department,
          isVerified: teacher.isVerified
        }
      }
    });

  } catch (error) {
    console.error('Teacher login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
      error: error.message
    });
  }
});

/**
 * GET /api/teachers/me
 * Get current teacher profile (protected)
 */
app.get('/api/teachers/me', authenticateTeacher, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        teacher: {
          id: req.teacher._id,
          name: req.teacher.name,
          email: req.teacher.email,
          department: req.teacher.department,
          isVerified: req.teacher.isVerified,
          createdAt: req.teacher.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Get teacher profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/login
 * Admin login endpoint
 */
app.post('/api/admin/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find admin
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if active
    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated.'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, admin.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: admin._id, email: admin.email, role: 'admin' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    console.log(`✅ Admin logged in: ${admin.email}`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role
        }
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
      error: error.message
    });
  }
});

// ==========================================
// �📍 CORE ENDPOINTS (Compatible with Flutter)
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

    // 🔒 FIX: Update status to 'cancelled' instead of deleting
    // This allows frontend to fetch and display cancelled state
    const result = await Attendance.findOneAndUpdate(
      {
        studentId,
        classId,
        sessionDate,
        status: 'provisional'
      },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(), // ✅ Matches model field name
          cancellationReason: 'Student left classroom before confirmation period ended'
        }
      },
      { new: true } // Return updated document
    );

    if (!result) {
      return res.status(404).json({
        error: 'No provisional attendance found',
        message: 'Cannot cancel attendance that does not exist or is already confirmed'
      });
    }

    console.log(`🚫 Cancelled provisional attendance for ${studentId} in ${classId} (left before confirmation)`);

    res.status(200).json({
      success: true,
      message: 'Provisional attendance cancelled successfully',
      reason: 'Student left classroom before confirmation period ended (out of beacon range)',
      cancelled: {
        studentId: result.studentId,
        classId: result.classId,
        checkInTime: result.checkInTime,
        sessionDate: result.sessionDate,
        status: result.status,
        cancelledAt: result.cancelledAt,
        cancellationReason: result.cancellationReason
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
// 📊 ADMIN & DASHBOARD ENDPOINTS
// ==========================================

/**
 * GET /api/admin/overview
 * Get comprehensive overview for admin dashboard
 */
app.get('/api/admin/overview', async (req, res) => {
  try {
    const [studentCount, attendanceCount, recentAttendance] = await Promise.all([
      Student.countDocuments(),
      Attendance.countDocuments(),
      Attendance.find()
        .sort({ checkInTime: -1 })
        .limit(10)
        .populate('studentId', 'studentId name')
    ]);

    // Calculate today's attendance
    const today = new Date();
    const sessionDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayAttendance = await Attendance.countDocuments({
      sessionDate,
      status: 'confirmed'
    });

    res.status(200).json({
      summary: {
        studentCount,
        classCount: 5, // Placeholder - you can add classes collection
        attendanceCount,
        todayAttendance
      },
      students: await Student.find().select('studentId name email deviceRegisteredAt'),
      teachers: [], // Placeholder - you can add teachers collection
      recentActivity: recentAttendance
    });

  } catch (error) {
    console.error('❌ Admin overview error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch admin overview',
      details: error.message 
    });
  }
});

/**
 * GET /api/admin/student/:studentId
 * Get detailed student information for admin
 */
app.get('/api/admin/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findOne({ studentId });
    if (!student) {
      return res.status(404).json({
        error: 'Student not found'
      });
    }

    // Get attendance history
    const attendanceHistory = await Attendance.find({ studentId })
      .sort({ checkInTime: -1 })
      .limit(20);

    // Calculate summary
    const totalSessions = attendanceHistory.length;
    const present = attendanceHistory.filter(a => a.status === 'confirmed').length;
    const absent = totalSessions - present;

    res.status(200).json({
      student: {
        id: student._id,
        name: student.name,
        email: student.email || '',
        studentId: student.studentId,
        year: student.year || '',
        section: student.section || '',
        deviceRegistered: !!student.deviceId,
        deviceRegisteredAt: student.deviceRegisteredAt
      },
      classes: [], // Placeholder - you can add enrollment logic
      attendance: attendanceHistory.map(a => ({
        class_id: a.classId,
        status: a.status === 'confirmed' ? 'present' : 'absent',
        timestamp: a.checkInTime
      })),
      summary: {
        totalSessions,
        present,
        absent
      }
    });

  } catch (error) {
    console.error('❌ Get student detail error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch student details',
      details: error.message 
    });
  }
});

/**
 * GET /api/classes
 * Get all classes (placeholder for now)
 */
app.get('/api/classes', async (req, res) => {
  try {
    // Placeholder data - you can create a Classes collection
    const classes = [
      { id: 'CSE101', name: 'Computer Science 101', students: 30 },
      { id: 'CSE102', name: 'Computer Science 102', students: 25 },
      { id: 'CSE201', name: 'Data Structures', students: 28 },
      { id: 'CSE301', name: 'Algorithms', students: 22 },
      { id: 'CSE401', name: 'Machine Learning', students: 20 }
    ];

    res.status(200).json({
      classes
    });

  } catch (error) {
    console.error('❌ Get classes error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch classes',
      details: error.message 
    });
  }
});

/**
 * GET /api/attendance/:classId
 * Get attendance for specific class
 */
app.get('/api/attendance/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const { date } = req.query;

    let query = { classId };
    
    if (date) {
      const queryDate = new Date(date);
      const sessionDate = new Date(queryDate.getFullYear(), queryDate.getMonth(), queryDate.getDate());
      query.sessionDate = sessionDate;
    }

    const attendance = await Attendance.find(query)
      .sort({ checkInTime: -1 })
      .populate('studentId', 'studentId name');

    res.status(200).json({
      attendance: attendance.map(a => ({
        id: a._id,
        student_id: a.studentId?.studentId || a.studentId,
        student_name: a.studentId?.name || `Student ${a.studentId}`,
        class_id: a.classId,
        status: a.status === 'confirmed' ? 'present' : 'absent',
        timestamp: a.checkInTime
      }))
    });

  } catch (error) {
    console.error('❌ Get class attendance error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch class attendance',
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
// � CLASS MANAGEMENT ENDPOINTS
// ==========================================

/**
 * POST /api/classes
 * Create a new class (protected - teachers only)
 */
app.post('/api/classes', authenticateTeacher, async (req, res) => {
  try {
    const { classId, name, subject, schedule, students, beaconConfig, room, semester, academicYear } = req.body;

    // Validation
    if (!classId || !name) {
      return res.status(400).json({
        success: false,
        message: 'Class ID and name are required'
      });
    }

    // Check if class already exists
    const existingClass = await Class.findOne({ classId });
    if (existingClass) {
      return res.status(409).json({
        success: false,
        message: 'Class with this ID already exists'
      });
    }

    // Create class
    const newClass = new Class({
      classId,
      name,
      subject,
      teacherId: req.teacher._id,
      schedule: schedule || {},
      students: students || [],
      beaconConfig: beaconConfig || {},
      room,
      semester,
      academicYear,
      isActive: true
    });

    await newClass.save();

    console.log(`✅ Class created: ${classId} by ${req.teacher.email}`);

    res.status(201).json({
      success: true,
      message: 'Class created successfully',
      data: {
        class: newClass
      }
    });

  } catch (error) {
    console.error('Create class error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create class',
      error: error.message
    });
  }
});

/**
 * GET /api/classes
 * Get all classes or filter by teacher
 */
app.get('/api/classes', authenticateTeacher, async (req, res) => {
  try {
    const { teacherId, isActive } = req.query;

    // Build query
    let query = {};
    
    // If teacherId provided, use it; otherwise use authenticated teacher's ID
    if (teacherId) {
      query.teacherId = teacherId;
    } else {
      query.teacherId = req.teacher._id;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const classes = await Class.find(query)
      .populate('teacherId', 'name email department')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        classes,
        count: classes.length
      }
    });

  } catch (error) {
    console.error('Get classes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch classes',
      error: error.message
    });
  }
});

/**
 * GET /api/classes/:classId
 * Get a specific class by ID
 */
app.get('/api/classes/:classId', authenticateTeacher, async (req, res) => {
  try {
    const { classId } = req.params;

    const classDoc = await Class.findOne({ classId })
      .populate('teacherId', 'name email department');

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check if teacher owns this class
    if (classDoc.teacherId._id.toString() !== req.teacher._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this class'
      });
    }

    res.json({
      success: true,
      data: {
        class: classDoc
      }
    });

  } catch (error) {
    console.error('Get class error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch class',
      error: error.message
    });
  }
});

/**
 * PUT /api/classes/:classId
 * Update a class (protected - owner only)
 */
app.put('/api/classes/:classId', authenticateTeacher, async (req, res) => {
  try {
    const { classId } = req.params;
    const updates = req.body;

    // Find class
    const classDoc = await Class.findOne({ classId });

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check if teacher owns this class
    if (classDoc.teacherId.toString() !== req.teacher._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this class'
      });
    }

    // Prevent changing classId or teacherId
    delete updates.classId;
    delete updates.teacherId;

    // Update class
    Object.assign(classDoc, updates);
    classDoc.updatedAt = Date.now();
    await classDoc.save();

    console.log(`✅ Class updated: ${classId} by ${req.teacher.email}`);

    res.json({
      success: true,
      message: 'Class updated successfully',
      data: {
        class: classDoc
      }
    });

  } catch (error) {
    console.error('Update class error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update class',
      error: error.message
    });
  }
});

/**
 * DELETE /api/classes/:classId
 * Delete a class (protected - owner only)
 * Soft delete by setting isActive to false
 */
app.delete('/api/classes/:classId', authenticateTeacher, async (req, res) => {
  try {
    const { classId } = req.params;
    const { hardDelete } = req.query; // Optional: ?hardDelete=true

    // Find class
    const classDoc = await Class.findOne({ classId });

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check if teacher owns this class
    if (classDoc.teacherId.toString() !== req.teacher._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this class'
      });
    }

    if (hardDelete === 'true') {
      // Hard delete (permanent)
      await Class.deleteOne({ classId });
      console.log(`❌ Class permanently deleted: ${classId} by ${req.teacher.email}`);
      
      res.json({
        success: true,
        message: 'Class permanently deleted'
      });
    } else {
      // Soft delete (set inactive)
      classDoc.isActive = false;
      classDoc.updatedAt = Date.now();
      await classDoc.save();

      console.log(`🗑️ Class deactivated: ${classId} by ${req.teacher.email}`);

      res.json({
        success: true,
        message: 'Class deactivated successfully',
        data: {
          class: classDoc
        }
      });
    }

  } catch (error) {
    console.error('Delete class error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete class',
      error: error.message
    });
  }
});

/**
 * POST /api/classes/:classId/students
 * Add students to a class
 */
app.post('/api/classes/:classId/students', authenticateTeacher, async (req, res) => {
  try {
    const { classId } = req.params;
    const { studentIds } = req.body; // Array of student IDs

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'studentIds must be a non-empty array'
      });
    }

    // Find class
    const classDoc = await Class.findOne({ classId });

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check if teacher owns this class
    if (classDoc.teacherId.toString() !== req.teacher._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to modify this class'
      });
    }

    // Add students (avoid duplicates)
    const existingStudents = new Set(classDoc.students);
    let addedCount = 0;

    for (const studentId of studentIds) {
      if (!existingStudents.has(studentId)) {
        classDoc.students.push(studentId);
        addedCount++;
      }
    }

    classDoc.updatedAt = Date.now();
    await classDoc.save();

    console.log(`✅ Added ${addedCount} students to class ${classId}`);

    res.json({
      success: true,
      message: `Added ${addedCount} students to class`,
      data: {
        class: classDoc
      }
    });

  } catch (error) {
    console.error('Add students error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add students',
      error: error.message
    });
  }
});

/**
 * DELETE /api/classes/:classId/students/:studentId
 * Remove a student from a class
 */
app.delete('/api/classes/:classId/students/:studentId', authenticateTeacher, async (req, res) => {
  try {
    const { classId, studentId } = req.params;

    // Find class
    const classDoc = await Class.findOne({ classId });

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check if teacher owns this class
    if (classDoc.teacherId.toString() !== req.teacher._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to modify this class'
      });
    }

    // Remove student
    const initialLength = classDoc.students.length;
    classDoc.students = classDoc.students.filter(id => id !== studentId);

    if (classDoc.students.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: 'Student not found in this class'
      });
    }

    classDoc.updatedAt = Date.now();
    await classDoc.save();

    console.log(`✅ Removed student ${studentId} from class ${classId}`);

    res.json({
      success: true,
      message: 'Student removed from class',
      data: {
        class: classDoc
      }
    });

  } catch (error) {
    console.error('Remove student error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove student',
      error: error.message
    });
  }
});

// ==========================================
// �🚀 SERVER STARTUP
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
        console.log(`\n🔐 Authentication:`);
        console.log(`   - POST /api/teachers/register`);
        console.log(`   - POST /api/teachers/login`);
        console.log(`   - GET  /api/teachers/me`);
        console.log(`   - POST /api/admin/login`);
        console.log(`\n📚 Class Management:`);
        console.log(`   - POST   /api/classes`);
        console.log(`   - GET    /api/classes`);
        console.log(`   - GET    /api/classes/:classId`);
        console.log(`   - PUT    /api/classes/:classId`);
        console.log(`   - DELETE /api/classes/:classId`);
        console.log(`   - POST   /api/classes/:classId/students`);
        console.log(`   - DELETE /api/classes/:classId/students/:studentId`);
        console.log(`\n📍 Student Attendance:`);
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
}