/**
 * 📡 RSSI Routes
 * 
 * Endpoints for RSSI data streaming and retrieval
 */

const express = require('express');
const router = express.Router();
const rssiController = require('../controllers/rssi.controller');

// Upload RSSI stream
router.post('/stream', rssiController.uploadStream);

// Get RSSI streams
router.get('/streams', rssiController.getStreams);

// Trigger correlation analysis (manual)
router.post('/analyze', rssiController.analyzeCorrelations);

module.exports = router;
