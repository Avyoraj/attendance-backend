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

// Supabase client
const { supabaseAdmin } = require('./utils/supabase');

// Routes
const sessionRoutes = require('./routes/session.routes');
const attendanceRoutes = require('./routes/attendance.routes');

const app = express();

// ==========================================
// 🔒 SECURITY & MIDDLEWARE
// ==========================================

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/public', express.static('public'));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.'
});

// ==========================================
// 📍 API ROUTES
// ==========================================

// Auth routes (Teacher login/register)
const authController = require('./controllers/auth.controller');
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);
app.get('/api/auth/me', authController.getMe);
app.post('/api/auth/logout', authController.logout);

// ==========================================
// 📚 STUDENTS & CLASSES ENDPOINTS (for Dashboard)
// ==========================================

// Get all students
app.get('/api/students', async (req, res) => {
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

// Get all classes
app.get('/api/classes', async (req, res) => {
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

// Get all rooms
app.get('/api/rooms', async (req, res) => {
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
app.use('/api/sessions', sessionRoutes);

// Check-in routes (Flutter app)
app.post('/api/check-in', require('./controllers/attendance.controller').checkIn);
app.post('/api/attendance/confirm', require('./controllers/attendance.controller').confirmAttendance);
app.post('/api/attendance/cancel-provisional', require('./controllers/attendance.controller').cancelProvisional);
app.post('/api/check-in/stream', require('./controllers/attendance.controller').uploadRssiStream);
app.post('/api/attendance/rssi-stream', require('./controllers/attendance.controller').uploadRssiStream);

// Attendance query routes
app.use('/api/attendance', attendanceRoutes);

// Manual attendance entry
app.post('/api/attendance/manual', require('./controllers/attendance.controller').manualEntry);

// Attendance history
app.get('/api/attendance/history', require('./controllers/attendance.controller').getHistory);

// ==========================================
// 🔍 ANOMALY ENDPOINTS (Proxy Detection)
// ==========================================

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

// ==========================================
// 📊 STUDENT ENDPOINTS (for Flutter)
// ==========================================

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
