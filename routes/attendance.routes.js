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

// Get ALL today's attendance (simplified demo - no session activator needed)
router.get('/today-all', attendanceController.getTodayAllAttendance);

// Get today's attendance for student
router.get('/today/:studentId', attendanceController.getTodayAttendance);

// Query attendance records
router.get('/', attendanceController.queryAttendance);

// Get attendance for specific class
router.get('/:classId', attendanceController.getClassAttendance);

module.exports = router;
