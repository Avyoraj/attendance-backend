const express = require('express');
const router = express.Router();

const reportsController = require('../controllers/reports.controller');

// Attendance correlation report
router.get('/attendance-correlation', reportsController.getAttendanceCorrelationReport);

module.exports = router;
