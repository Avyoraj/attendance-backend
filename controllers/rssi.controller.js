/**
 * 📡 RSSI Controller
 * 
 * Business logic for RSSI data streaming and correlation analysis
 */

const RSSIStream = require('../models/RSSIStream');
const { analyzeCorrelations } = require('../scripts/analyze-correlations');

/**
 * Upload RSSI stream data
 */
exports.uploadStream = async (req, res) => {
  try {
    const { studentId, classId, rssiData } = req.body;

    if (!studentId || !classId || !rssiData || !Array.isArray(rssiData)) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['studentId', 'classId', 'rssiData (array)']
      });
    }

    const today = new Date();
    const sessionDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Find or create RSSI stream
    let stream = await RSSIStream.findOne({
      studentId,
      classId,
      sessionDate
    });

    if (stream) {
      // Append new data
      stream.rssiData.push(...rssiData);
      stream.completedAt = new Date();
      stream.totalReadings = stream.rssiData.length;
    } else {
      // Create new stream
      stream = new RSSIStream({
        studentId,
        classId,
        sessionDate,
        rssiData,
        totalReadings: rssiData.length
      });
    }

    await stream.save();

    console.log(`📡 RSSI stream updated: ${studentId} in ${classId} (${stream.totalReadings} readings)`);

    res.status(200).json({
      message: 'RSSI data recorded',
      totalReadings: stream.totalReadings,
      streamId: stream._id
    });

  } catch (error) {
    console.error('❌ RSSI stream error:', error);
    res.status(500).json({ 
      error: 'Failed to record RSSI data',
      details: error.message 
    });
  }
};

/**
 * Get RSSI streams
 */
exports.getStreams = async (req, res) => {
  try {
    const { classId, date, studentId, limit = 100 } = req.query;

    const query = {};
    
    if (classId) query.classId = classId;
    if (studentId) query.studentId = studentId;
    
    if (date) {
      const queryDate = new Date(date);
      const sessionDate = new Date(queryDate.getFullYear(), queryDate.getMonth(), queryDate.getDate());
      query.sessionDate = sessionDate;
    }

    const streams = await RSSIStream
      .find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      count: streams.length,
      streams
    });

  } catch (error) {
    console.error('❌ Get RSSI streams error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch RSSI streams',
      details: error.message 
    });
  }
};

/**
 * Manually trigger correlation analysis
 */
exports.analyzeCorrelations = async (req, res) => {
  try {
    const { classId, sessionDate } = req.body;

    console.log(`\n🔍 Manual correlation analysis triggered`);
    console.log(`   Class: ${classId || 'all'}`);
    console.log(`   Date: ${sessionDate || 'last 24 hours'}\n`);

    // Run analysis (async)
    const results = await analyzeCorrelations(classId, sessionDate);

    res.status(200).json({
      message: 'Correlation analysis completed',
      results: {
        sessionsAnalyzed: results.sessions,
        pairsAnalyzed: results.analyzed,
        anomaliesDetected: results.flagged
      }
    });

  } catch (error) {
    console.error('❌ Correlation analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to run correlation analysis',
      details: error.message 
    });
  }
};
