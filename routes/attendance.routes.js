/**
 * ✅ Attendance Routes
 * 
 * Endpoints for attendance check-in, confirmation, and queries
 */

const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');

// Check-in (provisional)
router.post('/check-in', attendanceController.checkIn);

// Confirm attendance
router.post('/confirm', attendanceController.confirmAttendance);

// Cancel provisional attendance
router.post('/cancel-provisional', attendanceController.cancelProvisional);

// Get today's attendance for student
router.get('/today/:studentId', attendanceController.getTodayAttendance);

// Query attendance records
router.get('/', attendanceController.queryAttendance);

// Get attendance for specific class
router.get('/:classId', attendanceController.getClassAttendance);

module.exports = router;
