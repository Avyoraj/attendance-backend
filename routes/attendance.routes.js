/**
 * ✅ Attendance Routes
 * 
 * Endpoints for attendance queries and management
 * Note: /check-in, /confirm, /cancel-provisional are registered as direct routes in server.js
 * to match Flutter app's expected paths (/api/check-in vs /api/attendance/check-in)
 */

const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const { requireFields } = require('../utils/validators');
const { withMetrics } = require('../utils/metrics');
const rateLimit = require('express-rate-limit');

// Stricter rate limit for transactional endpoints
const checkLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many attendance requests, slow down.'
});

// ✅ Core Attendance Transaction Endpoints

// Check-in (Provisional)
router.post(
    '/check-in',
    checkLimiter,
    requireFields(['studentId', 'classId', 'deviceId', 'eventId', 'deviceSignature']),
    withMetrics('checkIn', attendanceController.checkIn)
);

// Confirm Attendance
router.post(
    '/confirm',
    checkLimiter,
    requireFields(['studentId', 'classId', 'deviceId', 'eventId', 'deviceSignature']),
    withMetrics('confirm', attendanceController.confirmAttendance)
);

// Cancel Provisional
router.post(
    '/cancel-provisional',
    checkLimiter,
    requireFields(['studentId', 'classId', 'deviceId', 'eventId', 'deviceSignature']),
    withMetrics('cancel', attendanceController.cancelProvisional)
);

// Get ALL today's attendance (simplified demo - no session activator needed)
router.get('/today-all', attendanceController.getTodayAllAttendance);

// Get today's attendance for student
router.get('/today/:studentId', attendanceController.getTodayAttendance);

// Query attendance records
router.get('/', attendanceController.queryAttendance);

// Get attendance for specific class
router.get('/:classId', attendanceController.getClassAttendance);

module.exports = router;
