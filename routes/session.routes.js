/**
 * Session Routes
 * 
 * Handles the "Session Activator" flow for teachers
 */

const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/session.controller');
const { authenticateTeacher } = require('../middleware/auth');

// ==========================================
// PUBLIC ROUTES (for Flutter app)
// ==========================================

// Get active session by beacon - Flutter calls this on beacon detection
router.get('/active/beacon/:major/:minor', sessionController.getActiveSessionByBeacon);

// Get all rooms (for dropdowns)
router.get('/rooms', sessionController.getRooms);

// Get all classes (for dropdowns)
router.get('/classes', sessionController.getClasses);

// ==========================================
// PROTECTED ROUTES (Teacher auth required)
// ==========================================

// Start a class session
router.post('/start', authenticateTeacher, sessionController.startSession);

// End a class session
router.post('/end', authenticateTeacher, sessionController.endSession);

// Get teacher's sessions for today
router.get('/today', authenticateTeacher, sessionController.getTodaySessions);

// Get session attendance details
router.get('/:sessionId/attendance', authenticateTeacher, sessionController.getSessionAttendance);

module.exports = router;
