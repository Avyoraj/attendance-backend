/**
 * 📡 RSSI Controller
 * 
 * Business logic for RSSI data streaming and correlation analysis
 */

const RSSIStream = require('../models/RSSIStream');
const { analyzeCorrelations } = require('../scripts/analyze-correlations');

/**
 * Upload RSSI stream data
 * 
 * Includes server-side time sync to handle client clock drift:
 * - Client sends `deviceTimestamp` (client's current time)
 * - Server calculates offset = serverTime - deviceTime
 * - All RSSI timestamps are corrected by this offset before storage
 */
exports.uploadStream = async (req, res) => {
  try {
    const { studentId, classId, rssiData, sessionDate: sessionDateInput, deviceTimestamp } = req.body;

    if (!studentId || !classId || !rssiData || !Array.isArray(rssiData)) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['studentId', 'classId', 'rssiData (array)']
      });
    }

    // Calculate clock offset for time sync
    // offset > 0 means device clock is behind server
    // offset < 0 means device clock is ahead of server
    let clockOffsetMs = 0;
    if (deviceTimestamp) {
      const deviceTime = new Date(deviceTimestamp).getTime();
      const serverTime = Date.now();
      clockOffsetMs = serverTime - deviceTime;
      
      // Log significant clock drift (> 5 seconds)
      if (Math.abs(clockOffsetMs) > 5000) {
        console.log(`⏰ Clock drift detected for ${studentId}: ${(clockOffsetMs / 1000).toFixed(1)}s`);
      }
    }

    // Correct timestamps in RSSI data if there's clock drift
    const correctedRssiData = rssiData.map(reading => {
      if (reading.timestamp && clockOffsetMs !== 0) {
        const originalTime = new Date(reading.timestamp).getTime();
        const correctedTime = new Date(originalTime + clockOffsetMs);
        return {
          ...reading,
          timestamp: correctedTime.toISOString(),
          originalTimestamp: reading.timestamp, // Keep original for debugging
          clockOffsetMs: clockOffsetMs // Store offset for analysis
        };
      }
      return reading;
    });

    // Use provided sessionDate if present, else default to today
    let sessionDate;
    if (sessionDateInput) {
      const d = new Date(sessionDateInput);
      sessionDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    } else {
      const today = new Date();
      sessionDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    }

    // Find or create RSSI stream
    let stream = await RSSIStream.findOne({
      studentId,
      classId,
      sessionDate
    });

    if (stream) {
      // Append new data (with corrected timestamps)
      stream.rssiData.push(...correctedRssiData);
      stream.completedAt = new Date();
      stream.totalReadings = stream.rssiData.length;
      // Track clock offset for this device
      if (clockOffsetMs !== 0) {
        stream.lastClockOffsetMs = clockOffsetMs;
      }
    } else {
      // Create new stream
      stream = new RSSIStream({
        studentId,
        classId,
        sessionDate,
        rssiData: correctedRssiData,
        totalReadings: correctedRssiData.length,
        lastClockOffsetMs: clockOffsetMs !== 0 ? clockOffsetMs : undefined
      });
    }

    await stream.save();

    console.log(`📡 RSSI stream updated: ${studentId} in ${classId} (${stream.totalReadings} readings)${clockOffsetMs !== 0 ? ` [clock offset: ${(clockOffsetMs/1000).toFixed(1)}s]` : ''}`);

    res.status(200).json({
      success: true,
      message: 'RSSI data recorded',
      totalReadings: stream.totalReadings,
      streamId: stream._id,
      clockOffsetMs: clockOffsetMs !== 0 ? clockOffsetMs : undefined
    });

  } catch (error) {
    console.error('❌ RSSI stream error:', error);
    res.status(500).json({ 
      success: false,
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
      success: true,
      count: streams.length,
      streams
    });

  } catch (error) {
    console.error('❌ Get RSSI streams error:', error);
    res.status(500).json({ 
      success: false,
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
