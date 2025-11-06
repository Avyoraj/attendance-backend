/**
 * 👤 Student Routes
 * 
 * Endpoints for student registration and device validation
 */

const express = require('express');
const router = express.Router();
const studentController = require('../controllers/student.controller');

// Device validation (before login)
router.post('/validate-device', studentController.validateDevice);

// Student registration
router.post('/register', studentController.registerStudent);

// Get student by ID
router.get('/:studentId', studentController.getStudentById);

module.exports = router;
