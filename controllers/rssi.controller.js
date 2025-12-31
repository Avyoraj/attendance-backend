/**
 * 📡 RSSI Controller (Supabase Version)
 * 
 * Business logic for RSSI data streaming and correlation analysis
 */

const { supabaseAdmin } = require('../utils/supabase');
const { analyzeCorrelations } = require('../scripts/analyze-correlations-supabase');

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
    let clockOffsetMs = 0;
    if (deviceTimestamp) {
      const deviceTime = new Date(deviceTimestamp).getTime();
      const serverTime = Date.now();
      clockOffsetMs = serverTime - deviceTime;
      
      if (Math.abs(clockOffsetMs) > 5000) {
        console.log(`⏰ Clock drift detected for ${studentId}: ${(clockOffsetMs / 1000).toFixed(1)}s`);
      }
    }

    // Correct timestamps in RSSI data
    const correctedRssiData = rssiData.map(reading => {
      if (reading.timestamp && clockOffsetMs !== 0) {
        const originalTime = new Date(reading.timestamp).getTime();
        const correctedTime = new Date(originalTime + clockOffsetMs);
        return {
          ...reading,
          timestamp: correctedTime.toISOString(),
          originalTimestamp: reading.timestamp,
          clockOffsetMs: clockOffsetMs
        };
      }
      return reading;
    });

    // Determine session date
    let sessionDate;
    if (sessionDateInput) {
      const d = new Date(sessionDateInput);
      sessionDate = d.toISOString().split('T')[0];
    } else {
      sessionDate = new Date().toISOString().split('T')[0];
    }

    // Find existing stream
    const { data: existingStream } = await supabaseAdmin
      .from('rssi_streams')
      .select('*')
      .eq('student_id', studentId)
      .eq('class_id', classId)
      .eq('session_date', sessionDate)
      .single();

    let streamId;
    let totalReadings;

    if (existingStream) {
      // Append new data
      // Note: Supabase JSONB append is tricky, usually we fetch, merge, update
      // Or use a stored procedure. For simplicity here: fetch -> merge -> update
      const updatedData = [...(existingStream.rssi_data || []), ...correctedRssiData];
      totalReadings = updatedData.length;

      const { data: updated, error } = await supabaseAdmin
        .from('rssi_streams')
        .update({
          rssi_data: updatedData,
          sample_count: totalReadings,
          completed_at: new Date().toISOString(),
          last_clock_offset_ms: clockOffsetMs !== 0 ? clockOffsetMs : existingStream.last_clock_offset_ms
        })
        .eq('id', existingStream.id)
        .select()
        .single();
      
      if (error) throw error;
      streamId = updated.id;
    } else {
      // Create new stream
      totalReadings = correctedRssiData.length;
      const { data: newStream, error } = await supabaseAdmin
        .from('rssi_streams')
        .insert({
          student_id: studentId,
          class_id: classId,
          session_date: sessionDate,
          rssi_data: correctedRssiData,
          sample_count: totalReadings,
          started_at: new Date().toISOString(),
          last_clock_offset_ms: clockOffsetMs !== 0 ? clockOffsetMs : null
        })
        .select()
        .single();

      if (error) throw error;
      streamId = newStream.id;
    }

    console.log(`📡 RSSI stream updated: ${studentId} in ${classId} (${totalReadings} readings)${clockOffsetMs !== 0 ? ` [clock offset: ${(clockOffsetMs/1000).toFixed(1)}s]` : ''}`);

    res.status(200).json({
      success: true,
      message: 'RSSI data recorded',
      totalReadings: totalReadings,
      streamId: streamId,
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

    let query = supabaseAdmin
      .from('rssi_streams')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (classId) query = query.eq('class_id', classId);
    if (studentId) query = query.eq('student_id', studentId);
    
    if (date) {
      const d = new Date(date);
      const sessionDate = d.toISOString().split('T')[0];
      query = query.eq('session_date', sessionDate);
    }

    const { data: streams, error } = await query;

    if (error) throw error;

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
        sessionsAnalyzed: results?.sessions || 0,
        pairsAnalyzed: results?.analyzed || 0,
        anomaliesDetected: results?.flagged || 0
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
