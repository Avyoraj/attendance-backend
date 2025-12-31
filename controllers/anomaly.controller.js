/**
 * 🚨 Anomaly Controller
 * 
 * Business logic for anomaly detection and management
 */

const anomalyService = require('../services/anomaly.service');

/**
 * Get anomalies
 */
exports.getAnomalies = async (req, res) => {
  try {
    const { classId, sessionDate, status, limit = 50 } = req.query;

    const anomalies = await anomalyService.getAnomalies({
      classId,
      sessionDate: sessionDate ? new Date(sessionDate) : null,
      status,
      limit: parseInt(limit)
    });

    res.status(200).json({
      count: anomalies.length,
      anomalies
    });

  } catch (error) {
    console.error('❌ Get anomalies error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch anomalies',
      details: error.message 
    });
  }
};

/**
 * Create anomaly flag
 */
exports.createAnomaly = async (req, res) => {
  try {
    const { classId, sessionDate, flaggedUsers, correlationScore, severity, metadata } = req.body;

    if (!classId || !sessionDate || !flaggedUsers || correlationScore === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['classId', 'sessionDate', 'flaggedUsers', 'correlationScore']
      });
    }

    const anomaly = await anomalyService.createAnomaly({
      classId,
      sessionDate: new Date(sessionDate),
      flaggedUsers,
      correlationScore,
      severity: severity || 'medium',
      metadata: metadata || {}
    });

    res.status(201).json({
      message: 'Anomaly recorded',
      anomaly
    });

  } catch (error) {
    console.error('❌ Create anomaly error:', error);
    res.status(500).json({ 
      error: 'Failed to record anomaly',
      details: error.message 
    });
  }
};

/**
 * Update anomaly status (review)
 */
exports.updateAnomalyStatus = async (req, res) => {
  try {
    const { anomalyId } = req.params;
    const { status, reviewedBy, reviewNotes } = req.body;

    if (!status) {
      return res.status(400).json({
        error: 'Missing required field: status',
        validStatuses: ['pending', 'confirmed_proxy', 'false_positive', 'investigating']
      });
    }

    const anomaly = await anomalyService.updateAnomalyStatus(
      anomalyId,
      status,
      reviewedBy || 'system',
      reviewNotes || ''
    );

    res.status(200).json({
      message: 'Anomaly status updated',
      anomaly
    });

  } catch (error) {
    console.error('❌ Update anomaly error:', error);
    
    if (error.message === 'Anomaly not found') {
      return res.status(404).json({
        error: 'Anomaly not found',
        message: `No anomaly found with ID: ${req.params.anomalyId}`
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to update anomaly',
      details: error.message 
    });
  }
};

/**
 * Get anomaly statistics
 */
exports.getStatistics = async (req, res) => {
  try {
    const { classId, startDate, endDate } = req.query;

    const statistics = await anomalyService.getStatistics({
      classId,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null
    });

    res.status(200).json({
      statistics
    });

  } catch (error) {
    console.error('❌ Get statistics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch statistics',
      details: error.message 
    });
  }
};
