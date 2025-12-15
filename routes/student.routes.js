/**
 * 👤 Student Routes
 * 
 * Endpoints for student registration and device validation
 */

const express = require('express');
const router = express.Router();
const studentController = require('../controllers/student.controller');
const { authenticateTeacher } = require('../middleware/auth');

// ===== PUBLIC ROUTES =====

// Device validation (before login)
router.post('/validate-device', studentController.validateDevice);

// Student registration
router.post('/register', studentController.registerStudent);

// ===== PROTECTED ROUTES (Teacher/Admin Only) =====
// NOTE: These must come BEFORE /:studentId to avoid "admin" being treated as a studentId

// Get all device bindings (for admin dashboard)
router.get('/admin/device-bindings', authenticateTeacher, studentController.getDeviceBindings);

// Reset device binding for a student (when they get a new phone)
router.post('/admin/reset-device/:studentId', authenticateTeacher, studentController.resetDeviceBinding);

// ===== PARAMETERIZED ROUTES (must be last) =====

// Get student by ID
router.get('/:studentId', studentController.getStudentById);

module.exports = router;
