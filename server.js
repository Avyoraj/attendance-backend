/**
 * 🚀 Attendance System Backend Server (Supabase Version)
 * 
 * Clean, modular architecture with:
 * - Routes: Endpoint definitions
 * - Controllers: Business logic (using Supabase)
 * - Middleware: Auth, validation
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

// Supabase client
const { supabaseAdmin } = require('./utils/supabase');

// Routes
const sessionRoutes = require('./routes/session.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const anomalyRoutes = require('./routes/anomaly.routes');
const rssiRoutes = require('./routes/rssi.routes');

// Simple in-memory metrics (reset on restart)
const metrics = {
  checkIn: { success: 0, fail: 0, durationMs: [] },
  confirm: { success: 0, fail: 0, durationMs: [] },
  cancel: { success: 0, fail: 0, durationMs: [] },
};

// Simple request body validator for required fields
const requireFields = (fields = []) => (req, res, next) => {
  const missing = fields.filter((f) =>
    req.body?.[f] === undefined || req.body?.[f] === null || req.body?.[f] === ''
  );

  if (missing.length) {
    return res.status(400).json({
      error: 'BAD_REQUEST',
      message: `Missing required field(s): ${missing.join(', ')}`,
      requestId: req.id,
    });
  }
  next();
};

const app = express();

// ==========================================
// 🔒 SECURITY & MIDDLEWARE
// ==========================================

// CORS - Must be FIRST before any other middleware
// Allow all origins for now (can restrict later)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Also use cors middleware as backup
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  credentials: true
}));

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Request ID middleware (per request) + logger
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-Id', req.id);
  const started = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - started;
    console.log(`${req.id} ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });

  next();
});

app.use(express.json());
app.use(express.static('public'));
app.use('/public', express.static('public'));

// Rate limiting (general + stricter for check-in/confirm)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.'
});

const checkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many attendance requests, slow down.'
});

// ==========================================
// 🩺 HEALTH / READINESS
// ==========================================

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/readyz', async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('students').select('id').limit(1);
    if (error) throw error;
    res.json({ status: 'ready' });
  } catch (error) {
    console.error(`${req.id} readiness check failed`, error);
    res.status(503).json({ error: 'NOT_READY', requestId: req.id });
  }
});

// Legacy health alias for React client
app.head('/api/health', (_req, res) => res.status(200).end());
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ==========================================
// 📍 API ROUTES
// ==========================================

// Mount modular routes
app.use('/api/sessions', sessionRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/anomalies', anomalyRoutes);
app.use('/api/rssi', rssiRoutes);

// Auth routes (Teacher login/register)
const authController = require('./controllers/auth.controller');
app.post('/api/auth/register', apiLimiter, authController.register);
app.post('/api/auth/login', apiLimiter, authController.login);
app.get('/api/auth/me', apiLimiter, authController.getMe);
app.post('/api/auth/logout', apiLimiter, authController.logout);
// Minimal reset stubs for UI compatibility
app.post('/api/auth/forgot-password', (_req, res) => res.json({ message: 'Reset code sent (stub)' }));
app.post('/api/auth/verify-reset-code', (_req, res) => res.json({ message: 'Code verified (stub)' }));
app.post('/api/auth/reset-password', (_req, res) => res.json({ message: 'Password reset (stub)' }));

// Admin overview endpoints for React dashboard
app.get('/api/admin/overview', apiLimiter, async (_req, res) => {
  try {
    const [{ data: teachers }, { data: students }] = await Promise.all([
      supabaseAdmin.from('teachers').select('*'),
      supabaseAdmin.from('students').select('*')
    ]);

    res.json({
      summary: {
        teacherCount: teachers?.length || 0,
        studentCount: students?.length || 0,
      },
      teachers: teachers || [],
      students: students || []
    });
  } catch (error) {
    console.error('❌ Admin overview error:', error);
    res.status(500).json({ error: 'Failed to load admin overview' });
  }
});

app.get('/api/admin/student/:id', apiLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin.from('students').select('*').eq('id', id).single();
    if (error) throw error;
    res.json(data || {});
  } catch (error) {
    console.error('❌ Admin student detail error:', error);
    res.status(404).json({ error: 'Student not found' });
  }
});

// ==========================================
// 📚 STUDENTS & CLASSES ENDPOINTS (for Dashboard)
// ==========================================

// Get all students
app.get('/api/students', apiLimiter, async (req, res) => {
  try {
    const { data: students, error } = await supabaseAdmin
      .from('students')
      .select('*')
      .order('name');
    
    if (error) throw error;
    res.json(students || []);
  } catch (error) {
    console.error('❌ Get students error:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Create student
app.post('/api/students', apiLimiter, async (req, res) => {
  try {
    const { student_id, name, email, year, section, device_id } = req.body;
    if (!student_id || !name) {
      return res.status(400).json({ error: 'student_id and name are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('students')
      .insert({ student_id, name, email: email || null, year: year ? Number(year) : null, section: section || null, device_id: device_id || null })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('❌ Create student error:', error);
    res.status(500).json({ error: 'Failed to create student' });
  }
});

// Update student profile (admin)
app.put('/api/students/:studentId/profile/admin', apiLimiter, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { name, email, year, section } = req.body;

    const { data, error } = await supabaseAdmin
      .from('students')
      .update({
        name: name || undefined,
        email: email || undefined,
        year: year ? Number(year) : null,
        section: section || null
      })
      .eq('student_id', studentId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('❌ Update student profile error:', error);
    res.status(500).json({ error: 'Failed to update student profile' });
  }
});

// Reset device binding
app.post('/api/students/:studentId/reset-device', apiLimiter, async (req, res) => {
  try {
    const { studentId } = req.params;
    await supabaseAdmin.from('students').update({ device_id: null }).eq('student_id', studentId);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Reset device error:', error);
    res.status(500).json({ error: 'Failed to reset device' });
  }
});

// Get all classes
app.get('/api/classes', apiLimiter, async (req, res) => {
  try {
    const { data: classes, error } = await supabaseAdmin
      .from('classes')
      .select('*')
      .order('name');
    
    if (error) throw error;
    res.json(classes || []);
  } catch (error) {
    console.error('❌ Get classes error:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

// Create class
app.post('/api/classes', apiLimiter, async (req, res) => {
  try {
    const { class_id, name, subject, teacher_id } = req.body;
    const finalId = class_id || name?.toLowerCase()?.replace(/\s+/g, '-') || `class-${Date.now()}`;

    const { data, error } = await supabaseAdmin
      .from('classes')
      .insert({ class_id: finalId, name: name || finalId, subject: subject || null, teacher_id: teacher_id || null })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('❌ Create class error:', error);
    res.status(500).json({ error: 'Failed to create class' });
  }
});

// Update class
app.put('/api/classes/:classId', apiLimiter, async (req, res) => {
  try {
    const { classId } = req.params;
    const { name, subject } = req.body;
    const { data, error } = await supabaseAdmin
      .from('classes')
      .update({ name, subject })
      .eq('class_id', classId)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('❌ Update class error:', error);
    res.status(500).json({ error: 'Failed to update class' });
  }
});

// Delete class
app.delete('/api/classes/:classId', apiLimiter, async (req, res) => {
  try {
    const { classId } = req.params;
    const { error } = await supabaseAdmin.from('classes').delete().eq('class_id', classId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Delete class error:', error);
    res.status(500).json({ error: 'Failed to delete class' });
  }
});

// Students in a class (simple: all students for now)
app.get('/api/classes/:classId/students', apiLimiter, async (req, res) => {
  try {
    const { data: students, error } = await supabaseAdmin
      .from('students')
      .select('*')
      .order('name');
    if (error) throw error;
    res.json(students || []);
  } catch (error) {
    console.error('❌ Class students error:', error);
    res.status(500).json({ error: 'Failed to fetch class students' });
  }
});

// Get all rooms
app.get('/api/rooms', apiLimiter, async (req, res) => {
  try {
    const { data: rooms, error } = await supabaseAdmin
      .from('rooms')
      .select('*')
      .order('name');
    
    if (error) throw error;
    res.json(rooms || []);
  } catch (error) {
    console.error('❌ Get rooms error:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// Session routes (Session Activator for teachers)
app.use('/api/sessions', apiLimiter, sessionRoutes);

// Session attendance detail for React live view
app.get('/api/sessions/:sessionId/attendance', apiLimiter, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('attendance')
      .select('*')
      .eq('session_id', sessionId)
      .order('check_in_time', { ascending: false });
    if (error) throw error;
    res.json({ attendance: data || [] });
  } catch (error) {
    console.error('❌ Session attendance error:', error);
    res.status(500).json({ error: 'Failed to fetch session attendance' });
  }
});

// Check-in routes (Flutter app)
const attendanceController = require('./controllers/attendance.controller');
app.post(
  '/api/check-in',
  checkLimiter,
  requireFields(['studentId', 'classId', 'deviceId', 'eventId', 'deviceSignature']),
  withMetrics('checkIn', attendanceController.checkIn)
);
app.post(
  '/api/attendance/confirm',
  checkLimiter,
  requireFields(['studentId', 'classId', 'deviceId', 'eventId', 'deviceSignature']),
  withMetrics('confirm', attendanceController.confirmAttendance)
);
app.post(
  '/api/attendance/cancel-provisional',
  checkLimiter,
  requireFields(['studentId', 'classId', 'deviceId', 'eventId', 'deviceSignature']),
  withMetrics('cancel', attendanceController.cancelProvisional)
);
app.post('/api/check-in/stream', checkLimiter, attendanceController.uploadRssiStream);
app.post('/api/attendance/rssi-stream', checkLimiter, attendanceController.uploadRssiStream);

// Attendance query routes
app.use('/api/attendance', apiLimiter, attendanceRoutes);

// Manual attendance entry
app.post('/api/attendance/manual', require('./controllers/attendance.controller').manualEntry);

// Attendance history
app.get('/api/attendance/history', require('./controllers/attendance.controller').getHistory);

// ==========================================
// 🧭 ERROR SHAPING
// ==========================================

// Not-found handler
app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found', requestId: req.id });
});

// Central error handler (sanitized)
app.use((err, req, res, _next) => {
  console.error(`${req.id} unhandled error`, err);
  const status = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
  res.status(status).json({
    error: status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
    message: err.message || 'An error occurred',
    requestId: req.id,
  });
});

// ==========================================
// 📈 METRICS EXPOSURE (basic, unauthenticated)
// ==========================================
app.get('/metrics/basic', (_req, res) => {
  const summarize = (name) => {
    const bucket = metrics[name];
    const samples = bucket.durationMs.length;
    const avg = samples ? bucket.durationMs.reduce((a, b) => a + b, 0) / samples : 0;
    return { success: bucket.success, fail: bucket.fail, avgMs: Math.round(avg) };
  };

  res.json({
    checkIn: summarize('checkIn'),
    confirm: summarize('confirm'),
    cancel: summarize('cancel'),
  });
});

// Wrapper to capture duration/success per route
function withMetrics(name, handler) {
  return async (req, res, next) => {
    const start = Date.now();
    const bucket = metrics[name] || { success: 0, fail: 0, durationMs: [] };

    // Wrap res.end to inspect status
    const originalEnd = res.end;
    res.end = function (...args) {
      const duration = Date.now() - start;
      bucket.durationMs.push(duration);
      if (res.statusCode >= 200 && res.statusCode < 400) {
        bucket.success += 1;
      } else {
        bucket.fail += 1;
      }
      metrics[name] = bucket;
      return originalEnd.apply(this, args);
    };

    try {
      await handler(req, res, next);
    } catch (err) {
      bucket.fail += 1;
      metrics[name] = bucket;
      next(err);
    }
  };
}

// ==========================================
// 🔍 ANOMALY ENDPOINTS (Proxy Detection)
// ==========================================

// Check if student is flagged for proxy (for Flutter app)
app.get('/api/anomalies/check/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const today = new Date().toISOString().split('T')[0];
    
    const { data: anomalies, error } = await supabaseAdmin
      .from('anomalies')
      .select('*')
      .eq('status', 'pending')
      .eq('session_date', today)
      .or(`student_id_1.eq.${studentId},student_id_2.eq.${studentId}`);
    
    if (error) throw error;
    
    if (anomalies && anomalies.length > 0) {
      const anomaly = anomalies[0];
      const otherStudent = anomaly.student_id_1 === studentId ? anomaly.student_id_2 : anomaly.student_id_1;
      
      return res.json({
        flagged: true,
        message: `Suspicious pattern detected with ${otherStudent}`,
        anomalyId: anomaly.id,
        correlationScore: anomaly.correlation_score,
        otherStudent,
        severity: anomaly.severity
      });
    }
    
    res.json({ flagged: false, message: 'No anomalies detected' });
  } catch (error) {
    console.error('❌ Check anomaly error:', error);
    res.status(500).json({ error: 'Failed to check anomalies' });
  }
});

// Get anomalies with filters
app.get('/api/anomalies', async (req, res) => {
  try {
    const { status, classId, limit = 50 } = req.query;
    
    let query = supabaseAdmin.from('anomalies').select('*');
    
    if (status) query = query.eq('status', status);
    if (classId) query = query.eq('class_id', classId);
    
    const { data: anomalies, error } = await query
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    
    if (error) throw error;
    
    res.json({ anomalies: anomalies || [] });
  } catch (error) {
    console.error('❌ Get anomalies error:', error);
    res.status(500).json({ error: 'Failed to fetch anomalies' });
  }
});

// Review an anomaly (confirm proxy or mark as false positive)
app.put('/api/anomalies/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body; // action: 'confirm_proxy' | 'false_positive'
    
    if (!action || !['confirm_proxy', 'false_positive'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Use confirm_proxy or false_positive' });
    }
    
    const { data: anomaly, error } = await supabaseAdmin
      .from('anomalies')
      .update({
        status: action === 'confirm_proxy' ? 'confirmed_proxy' : 'false_positive',
        reviewed_at: new Date().toISOString(),
        notes: notes || null
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    // If confirmed proxy, mark both students' attendance as flagged
    if (action === 'confirm_proxy' && anomaly) {
      await supabaseAdmin
        .from('attendance')
        .update({ status: 'cancelled', cancellation_reason: 'Proxy attendance detected' })
        .eq('student_id', anomaly.student_id_1)
        .eq('session_date', anomaly.session_date);
      
      await supabaseAdmin
        .from('attendance')
        .update({ status: 'cancelled', cancellation_reason: 'Proxy attendance detected' })
        .eq('student_id', anomaly.student_id_2)
        .eq('session_date', anomaly.session_date);
    }
    
    res.json({ success: true, anomaly });
  } catch (error) {
    console.error('❌ Review anomaly error:', error);
    res.status(500).json({ error: 'Failed to review anomaly' });
  }
});

// Get today's RSSI streams for live monitoring
app.get('/api/rssi/streams/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data: streams, error } = await supabaseAdmin
      .from('rssi_streams')
      .select('student_id, class_id, session_date, sample_count, created_at, updated_at')
      .eq('session_date', today)
      .order('updated_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ 
      streams: streams || [],
      date: today,
      count: streams?.length || 0
    });
  } catch (error) {
    console.error('❌ Get today streams error:', error);
    res.status(500).json({ error: 'Failed to fetch today streams' });
  }
});

// Get RSSI streams for anomaly visualization
app.get('/api/rssi-streams/:classId/:date', async (req, res) => {
  try {
    const { classId, date } = req.params;
    
    const { data: streams, error } = await supabaseAdmin
      .from('rssi_streams')
      .select('*')
      .eq('class_id', classId)
      .eq('session_date', date);
    
    if (error) throw error;
    
    res.json({ streams: streams || [] });
  } catch (error) {
    console.error('❌ Get RSSI streams error:', error);
    res.status(500).json({ error: 'Failed to fetch RSSI streams' });
  }
});

// Trigger correlation analysis
app.post('/api/analyze-correlations', async (req, res) => {
  try {
    const { classId, sessionDate } = req.body;
    
    console.log('🔍 Triggering correlation analysis...');
    
    const { analyzeCorrelations } = require('./scripts/analyze-correlations-supabase');
    const results = await analyzeCorrelations(classId || null, sessionDate || null);
    
    res.json({
      success: true,
      message: 'Correlation analysis complete',
      results
    });
  } catch (error) {
    console.error('❌ Correlation analysis error:', error);
    res.status(500).json({ error: 'Failed to run correlation analysis' });
  }
});

// Run correlation test with simulated data
app.get('/api/analyze-correlations/test', async (req, res) => {
  try {
    console.log('🧪 Running correlation test with simulated data...');
    
    const { runWithTestData } = require('./scripts/analyze-correlations-supabase');
    const results = await runWithTestData();
    
    res.json({
      success: true,
      message: 'Test analysis complete',
      totalPairs: results.totalPairs,
      flaggedCount: results.flaggedCount,
      results: results.allResults.map(r => ({
        student1: r.student1,
        student2: r.student2,
        correlation: r.correlation.toFixed(4),
        suspicious: r.suspicious,
        reason: r.suspiciousDescription
      }))
    });
  } catch (error) {
    console.error('❌ Test analysis error:', error);
    res.status(500).json({ error: 'Failed to run test analysis' });
  }
});

// ==========================================
// 📊 STUDENT ENDPOINTS (for Flutter)
// ==========================================

// Validate device before login (device binding check)
app.post('/api/validate-device', async (req, res) => {
  try {
    const { studentId, deviceId } = req.body;

    if (!studentId || !deviceId) {
      return res.status(400).json({ 
        canLogin: false, 
        error: 'Missing required fields',
        message: 'Student ID and Device ID are required'
      });
    }

    console.log(`🔐 Device validation: Student=${studentId}, Device=${deviceId}`);

    // Check if student exists
    const { data: student, error: studentError } = await supabaseAdmin
      .from('students')
      .select('*')
      .eq('student_id', studentId)
      .single();

    if (studentError && studentError.code !== 'PGRST116') {
      throw studentError;
    }

    if (!student) {
      // Student doesn't exist - create new student with this device
      const { data: newStudent, error: createError } = await supabaseAdmin
        .from('students')
        .insert({
          student_id: studentId,
          name: `Student ${studentId}`,
          device_id: deviceId
        })
        .select()
        .single();

      if (createError) throw createError;

      console.log(`✅ New student created: ${studentId} with device ${deviceId}`);
      return res.json({
        canLogin: true,
        message: 'Welcome! Your device has been registered.',
        isNewStudent: true
      });
    }

    // Student exists - check device binding
    if (!student.device_id) {
      // No device bound yet - bind this device
      const { error: updateError } = await supabaseAdmin
        .from('students')
        .update({ device_id: deviceId })
        .eq('student_id', studentId);

      if (updateError) throw updateError;

      console.log(`✅ Device bound to existing student: ${studentId}`);
      return res.json({
        canLogin: true,
        message: 'Welcome back! Your device has been registered.'
      });
    }

    if (student.device_id === deviceId) {
      // Same device - allow login
      console.log(`✅ Device match for student: ${studentId}`);
      return res.json({
        canLogin: true,
        message: 'Welcome back!'
      });
    }

    // Different device - BLOCK LOGIN
    console.log(`🔒 Device mismatch for ${studentId}: expected ${student.device_id}, got ${deviceId}`);
    return res.status(403).json({
      canLogin: false,
      error: 'DEVICE_MISMATCH',
      message: 'This account is linked to another device. Contact admin to reset.',
      lockedToStudent: studentId
    });

  } catch (error) {
    console.error('❌ Device validation error:', error);
    res.status(500).json({
      canLogin: false,
      error: 'Server error',
      message: 'Unable to validate device. Please try again.'
    });
  }
});

// Reset device binding for a student (Teacher action)
app.post('/api/students/:studentId/reset-device', async (req, res) => {
  try {
    const { studentId } = req.params;

    console.log(`🔓 Resetting device binding for student: ${studentId}`);

    const { data: student, error } = await supabaseAdmin
      .from('students')
      .update({ device_id: null })
      .eq('student_id', studentId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Student not found' });
      }
      throw error;
    }

    console.log(`✅ Device binding reset for student: ${studentId}`);
    res.json({ 
      success: true, 
      message: `Device binding reset for ${studentId}`,
      student 
    });

  } catch (error) {
    console.error('❌ Reset device error:', error);
    res.status(500).json({ error: 'Failed to reset device binding' });
  }
});

// Get student summary for home screen
app.get('/api/students/:studentId/summary', async (req, res) => {
  try {
    const { studentId } = req.params;
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's attendance
    const { data: todayAttendance } = await supabaseAdmin
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .eq('session_date', today);

    // Get last 7 days attendance
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const { data: weekAttendance } = await supabaseAdmin
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .gte('session_date', weekAgo.toISOString().split('T')[0])
      .order('session_date', { ascending: false });

    // Calculate stats
    const confirmed = weekAttendance?.filter(a => a.status === 'confirmed').length || 0;
    const total = weekAttendance?.length || 0;
    const percentage = total > 0 ? Math.round((confirmed / total) * 100) : 0;

    res.json({
      studentId,
      today: {
        date: today,
        attendance: todayAttendance || [],
        hasConfirmed: todayAttendance?.some(a => a.status === 'confirmed') || false
      },
      weekStats: {
        confirmed,
        total,
        percentage
      },
      recentHistory: weekAttendance || []
    });

  } catch (error) {
    console.error('❌ Get student summary error:', error);
    res.status(500).json({ error: 'Failed to get summary' });
  }
});

// Get student attendance history
app.get('/api/students/:studentId/history', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { days = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const { data: attendance, error } = await supabaseAdmin
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .gte('session_date', startDate.toISOString().split('T')[0])
      .order('session_date', { ascending: false });

    if (error) throw error;

    res.json({ studentId, attendance: attendance || [] });

  } catch (error) {
    console.error('❌ Get student history error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// Get student profile
app.get('/api/students/:studentId/profile', async (req, res) => {
  try {
    const { studentId } = req.params;

    const { data: student, error } = await supabaseAdmin
      .from('students')
      .select('*')
      .eq('student_id', studentId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Check if profile is complete (has name that's not auto-generated)
    const isProfileComplete = student.name && 
      !student.name.startsWith('Student ') && 
      student.name !== studentId;

    res.json({
      studentId: student.student_id,
      name: student.name,
      email: student.email,
      year: student.year,
      section: student.section,
      department: student.department,
      deviceId: student.device_id,
      isProfileComplete,
      createdAt: student.created_at
    });

  } catch (error) {
    console.error('❌ Get student profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update student profile (one-time setup)
app.put('/api/students/:studentId/profile', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { name, email, year, section, department } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name is required (min 2 characters)' });
    }

    // Check if student exists
    const { data: existing } = await supabaseAdmin
      .from('students')
      .select('name')
      .eq('student_id', studentId)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Check if profile was already set (not auto-generated name)
    const wasAlreadySet = existing.name && 
      !existing.name.startsWith('Student ') && 
      existing.name !== studentId;

    if (wasAlreadySet) {
      return res.status(403).json({ 
        error: 'Profile already set',
        message: 'Profile can only be set once. Contact your teacher to make changes.'
      });
    }

    // Update profile
    const { data: updated, error } = await supabaseAdmin
      .from('students')
      .update({
        name: name.trim(),
        email: email?.trim() || null,
        year: year ? parseInt(year) : null,
        section: section?.trim() || null,
        department: department?.trim() || null
      })
      .eq('student_id', studentId)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Profile updated for student: ${studentId}`);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: {
        studentId: updated.student_id,
        name: updated.name,
        email: updated.email,
        year: updated.year,
        section: updated.section,
        department: updated.department
      }
    });

  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Update student profile (Teacher/Admin - can always update)
app.put('/api/students/:studentId/profile/admin', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { name, email, year, section, department } = req.body;

    const { data: updated, error } = await supabaseAdmin
      .from('students')
      .update({
        name: name?.trim() || undefined,
        email: email?.trim() || null,
        year: year ? parseInt(year) : null,
        section: section?.trim() || null,
        department: department?.trim() || null
      })
      .eq('student_id', studentId)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Profile updated by admin for student: ${studentId}`);

    res.json({ success: true, student: updated });

  } catch (error) {
    console.error('❌ Admin update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ==========================================
// 🏥 HEALTH CHECK
// ==========================================

app.get('/api/health', async (req, res) => {
  try {
    const { data: rooms } = await supabaseAdmin.from('rooms').select('id').limit(1);
    const { data: students } = await supabaseAdmin.from('students').select('id').limit(1);

    res.status(200).json({
      status: 'ok',
      database: 'supabase',
      connected: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: 'supabase',
      connected: false,
      error: error.message
    });
  }
});

// Dashboard (root route)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// 🚀 SERVER STARTUP
// ==========================================

const PORT = process.env.PORT || 3000;

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 ATTENDANCE SYSTEM BACKEND - RUNNING (Supabase)');
    console.log('='.repeat(60));
    console.log(`📡 Server: http://localhost:${PORT}`);
    console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
    console.log('='.repeat(60) + '\n');
  });

  module.exports = app;
}
