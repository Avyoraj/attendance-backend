/**
 * 🚨 Anomaly Routes
 * 
 * Endpoints for anomaly detection and management
 */

const express = require('express');
const router = express.Router();
const anomalyController = require('../controllers/anomaly.controller');

// Get anomalies
router.get('/', anomalyController.getAnomalies);

// Create anomaly flag (manual/automated)
router.post('/', anomalyController.createAnomaly);

// Update anomaly status (review)
router.put('/:anomalyId', anomalyController.updateAnomalyStatus);

// Get anomaly statistics
router.get('/statistics', anomalyController.getStatistics);

module.exports = router;
