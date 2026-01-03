/**
 * Attendance Controller (Supabase Version)
 * 
 * Business logic for attendance check-in, confirmation, and queries
 */

const { supabaseAdmin } = require('../utils/supabase');
const { verifyDeviceSignature } = require('../utils/security');
const { stableHash, findKey, persistKey } = require('../utils/idempotency');

// ------------------------------------------------------------------
// ⚙️ CONFIGURATION SWITCH
// ------------------------------------------------------------------
// Set to TRUE for Demo (3 mins), FALSE for Production (30 mins)
const IS_DEMO_MODE = true; 

const CONFIRMATION_WINDOW_SECONDS = IS_DEMO_MODE ? 180 : 1800; // 3 mins vs 30 mins
// ------------------------------------------------------------------

/**
 * Check-in (provisional attendance)
 */
exports.checkIn = async (req, res) => {
  try {
    const { studentId, classId, eventId, deviceSignature, deviceSaltVersion = 'v1', deviceIdHash, deviceId: legacyDeviceId, rssi, distance, beaconMajor, beaconMinor } = req.body;
    const deviceId = deviceIdHash || legacyDeviceId || null;

    if (!studentId || !classId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['studentId', 'classId']
      });
    }

    if (!eventId || !deviceId) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Missing required field(s): eventId or deviceId'
      });
    }

    const today = new Date().toISOString().split('T')[0];

    // Verify device signature (HMAC) to prevent spoofing
    const { valid: signatureValid } = verifyDeviceSignature({
      deviceId,
      signature: deviceSignature,
      version: deviceSaltVersion
    });

    if (!signatureValid) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_DEVICE_SIGNATURE',
        message: 'Device signature invalid or missing'
      });
    }

    // Idempotency check
    const scope = `checkin:${studentId}:${classId}:${today}`;
    const requestHash = stableHash({ studentId, classId, deviceId, eventId, beaconMajor, beaconMinor });
    const existingKey = await findKey(eventId, scope);

    if (existingKey) {
      if (existingKey.request_hash !== requestHash) {
        return res.status(409).json({
          success: false,
          error: 'IDEMPOTENCY_CONFLICT',
          message: 'Event already used with a different payload'
        });
      }

      return res.status(existingKey.status_code || 200).json(existingKey.response || {
        success: true,
        message: 'Attendance already recorded'
      });
    }

    // Check device binding
    if (deviceId) {
      const { data: existingDeviceUser } = await supabaseAdmin
        .from('students')
        .select('student_id')
        .eq('device_id', deviceId)
        .single();

      if (existingDeviceUser && existingDeviceUser.student_id !== studentId) {
        return res.status(403).json({
          success: false,
          error: 'DEVICE_MISMATCH',
          message: `This device is already linked to another student account (${existingDeviceUser.student_id})`
        });
      }
    }

    // Get or create student
    let { data: student } = await supabaseAdmin
      .from('students')
      .select('*')
      .eq('student_id', studentId)
      .single();

    if (!student) {
      const { data: newStudent } = await supabaseAdmin
        .from('students')
        .insert({
          student_id: studentId,
          name: `Student ${studentId}`,
          device_id: deviceId
        })
        .select()
        .single();
      student = newStudent;
    } else if (!student.device_id && deviceId) {
      await supabaseAdmin
        .from('students')
        .update({ device_id: deviceId })
        .eq('student_id', studentId);
    }

    // Check for existing attendance today
    const { data: existing } = await supabaseAdmin
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .eq('class_id', classId)
      .eq('session_date', today)
      .single();

    if (existing) {
      const confirmationWindowSeconds = CONFIRMATION_WINDOW_SECONDS;
      const now = new Date();
      let remainingSeconds = 0;
      
      if (existing.status === 'provisional' && existing.check_in_time) {
        const elapsed = Math.floor((now.getTime() - new Date(existing.check_in_time).getTime()) / 1000);
        remainingSeconds = Math.max(confirmationWindowSeconds - elapsed, 0);
      }

      return res.status(200).json({
        success: true,
        message: 'Attendance already recorded',
        status: existing.status,
        alreadyMarked: true,
        remainingSeconds,
        attendance: {
          id: existing.id,
          studentId: existing.student_id,
          classId: existing.class_id,
          status: existing.status,
          checkInTime: existing.check_in_time,
          confirmedAt: existing.confirmed_at
        }
      });
    }

    // Create new attendance
    const { data: attendance, error } = await supabaseAdmin
      .from('attendance')
      .insert({
        student_id: studentId,
        class_id: classId,
        device_id: deviceId || student?.device_id,
        status: 'provisional',
        event_id: eventId,
        rssi: rssi || -70,
        distance: distance || null,
        beacon_major: beaconMajor || null,
        beacon_minor: beaconMinor || null,
        session_date: today
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(200).json({ success: true, message: 'Attendance already recorded' });
      }
      throw error;
    }

    console.log(`✅ Attendance marked: ${studentId} in ${classId} (provisional)`);

    const responseBody = {
      success: true,
      message: 'Attendance recorded successfully',
      status: 'provisional',
      remainingSeconds: CONFIRMATION_WINDOW_SECONDS,
      attendance: {
        id: attendance.id,
        studentId: attendance.student_id,
        classId: attendance.class_id,
        status: attendance.status,
        checkInTime: attendance.check_in_time,
        rssi: attendance.rssi
      }
    };

    await persistKey({
      eventId,
      scope,
      requestHash,
      response: responseBody,
      statusCode: 201
    });

    res.status(201).json(responseBody);

  } catch (error) {
    console.error('❌ Check-in error:', error);
    res.status(500).json({ success: false, error: 'Failed to record attendance' });
  }
};


/**
 * Confirm provisional attendance (Supabase-only)
 * - Enforces provisional TTL (auto-cancel if stale)
 * - Runs correlation check against today's/class streams; blocks if flagged unless teacher override
 * - Respects device binding; supports optional teacherOverride flag
 */
exports.confirmAttendance = async (req, res) => {
  try {
    const { studentId, classId, attendanceId, eventId, deviceSignature, deviceSaltVersion = 'v1', deviceIdHash, deviceId: legacyDeviceId, teacherOverride = false, overrideNote } = req.body;
    const deviceId = deviceIdHash || legacyDeviceId || null;

    if (!studentId || !classId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!eventId || !deviceId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const today = new Date().toISOString().split('T')[0];

    const { valid: signatureValid } = verifyDeviceSignature({ deviceId, signature: deviceSignature, version: deviceSaltVersion });
    if (!signatureValid) {
      return res.status(401).json({ success: false, error: 'INVALID_DEVICE_SIGNATURE' });
    }

    const scope = `confirm:${studentId}:${classId}:${today}`;
    const requestHash = stableHash({ studentId, classId, attendanceId, deviceId, eventId, teacherOverride });
    const existingKey = await findKey(eventId, scope);

    if (existingKey) {
      if (existingKey.request_hash !== requestHash) {
        return res.status(409).json({ success: false, error: 'IDEMPOTENCY_CONFLICT' });
      }
      return res.status(existingKey.status_code || 200).json(existingKey.response || { success: true, message: 'Already confirmed' });
    }
    
    // Use the configured window (Demo vs Prod)
    const confirmationWindowSeconds = CONFIRMATION_WINDOW_SECONDS;

    // Find attendance record (provisional for today/class)
    let query = supabaseAdmin
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .eq('class_id', classId)
      .eq('status', 'provisional');

    if (attendanceId) {
      query = query.eq('id', attendanceId);
    } else {
      query = query.eq('session_date', today);
    }

    const { data: attendance, error: findError } = await query.single();

    if (findError || !attendance) {
      return res.status(404).json({
        error: 'No provisional attendance found',
        message: 'Cannot confirm attendance that does not exist or is already confirmed'
      });
    }

    // TTL enforcement: if provisional is older than window + grace period, cancel and stop
    // Grace period (30s) accounts for: network delays, final proximity gate, processing time
    const TTL_GRACE_PERIOD_SECONDS = 30;
    const checkInTime = attendance.check_in_time ? new Date(attendance.check_in_time) : null;
    if (checkInTime) {
      const elapsed = (Date.now() - checkInTime.getTime()) / 1000;
      if (elapsed > confirmationWindowSeconds + TTL_GRACE_PERIOD_SECONDS) {
        // Auto-cancel stale provisional
        await supabaseAdmin
          .from('attendance')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancellation_reason: 'Provisional expired before confirmation'
          })
          .eq('id', attendance.id);

        return res.status(410).json({
          success: false,
          error: 'PROVISIONAL_EXPIRED',
          message: 'Provisional attendance expired before confirmation.'
        });
      }
    }

    // Device binding check
    if (deviceId) {
      const { data: student } = await supabaseAdmin
        .from('students')
        .select('device_id')
        .eq('student_id', studentId)
        .single();

      if (student?.device_id && student.device_id !== deviceId) {
        return res.status(403).json({
          success: false,
          error: 'DEVICE_MISMATCH',
          message: 'This account is linked to a different device'
        });
      }
    }

    // If no teacher override, block if already pending anomaly or fresh correlation says suspicious
    if (!teacherOverride) {
      const { data: pendingAnomalies } = await supabaseAdmin
        .from('anomalies')
        .select('*')
        .eq('status', 'pending')
        .eq('session_date', today)
        .or(`student_id_1.eq.${studentId},student_id_2.eq.${studentId}`)
        .limit(1);

      const existingAnomaly = pendingAnomalies?.[0];
      if (existingAnomaly) {
        const otherStudent = existingAnomaly.student_id_1 === studentId ? existingAnomaly.student_id_2 : existingAnomaly.student_id_1;
        
        // Update attendance status to 'flagged' so it doesn't restart the timer
        await supabaseAdmin
          .from('attendance')
          .update({ 
            status: 'flagged',
            cancellation_reason: `Proxy pattern detected with ${otherStudent}. Correlation: ${existingAnomaly.correlation_score?.toFixed(3) || 'N/A'}`
          })
          .eq('id', attendance.id);
        
        console.log(`🚨 PROXY DETECTED: ${studentId} flagged with ${otherStudent} (ρ=${existingAnomaly.correlation_score?.toFixed(3)})`);
        
        return res.status(403).json({
          success: false,
          error: 'PROXY_DETECTED',
          message: `Attendance blocked: Suspicious pattern detected with ${otherStudent}. Please see your teacher.`,
          anomalyId: existingAnomaly.id,
          correlationScore: existingAnomaly.correlation_score,
          otherStudent
        });
      }

      const correlationResult = await runCorrelationCheckForStudent({ studentId, classId, sessionDate: today });
      if (correlationResult?.flagged) {
        // Update attendance status to 'flagged' so it doesn't restart the timer
        await supabaseAdmin
          .from('attendance')
          .update({ 
            status: 'flagged',
            cancellation_reason: `Proxy pattern detected with ${correlationResult.otherStudent}. Correlation: ${correlationResult.correlationScore?.toFixed(3) || 'N/A'}`
          })
          .eq('id', attendance.id);
        
        console.log(`🚨 PROXY DETECTED: ${studentId} flagged with ${correlationResult.otherStudent} (ρ=${correlationResult.correlationScore?.toFixed(3)})`);
        
        return res.status(403).json({
          success: false,
          error: 'PROXY_DETECTED',
          message: correlationResult.message,
          anomalyId: correlationResult.anomalyId,
          correlationScore: correlationResult.correlationScore,
          otherStudent: correlationResult.otherStudent
        });
      }
    }

    // Update to confirmed
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('attendance')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString()
      })
      .eq('id', attendance.id)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log(`✅ Attendance confirmed: ${studentId} in ${classId}${teacherOverride ? ' (override)' : ''}`);

    const responseBody = {
      success: true,
      message: 'Attendance confirmed successfully',
      attendance: {
        id: updated.id,
        status: updated.status,
        checkInTime: updated.check_in_time,
        confirmedAt: updated.confirmed_at,
        override: !!teacherOverride
      }
    };

    await persistKey({
      eventId,
      scope,
      requestHash,
      response: responseBody,
      statusCode: 200
    });

    res.status(200).json(responseBody);

  } catch (error) {
    console.error('❌ Confirmation error:', error);
    res.status(500).json({ success: false, error: 'Failed to confirm attendance' });
  }
};

/**
 * Run correlation check for a single student against others in the same class/session.
 * Creates/updates anomalies when flagged.
 */
async function runCorrelationCheckForStudent({ studentId, classId, sessionDate }) {
  // Quality gates
  const MIN_SAMPLES = 10;
  const MAX_OUTLIERS_TRIM = 0.05; // trim top/bottom 5%

  // Load streams for class/session
  const { data: streams, error } = await supabaseAdmin
    .from('rssi_streams')
    .select('*')
    .eq('class_id', classId)
    .eq('session_date', sessionDate)
    .gte('sample_count', MIN_SAMPLES);

  if (error) {
    console.error('❌ Correlation load error:', error);
    return null;
  }

  if (!streams || streams.length < 2) {
    return null; // nothing to compare
  }

  const target = streams.find(s => s.student_id === studentId);
  if (!target) return null;

  const correlationService = require('../services/correlation.service');

  const formattedTarget = formatRssiStream(target, MAX_OUTLIERS_TRIM);

  let bestFlag = null;

  for (const peer of streams) {
    if (peer.student_id === studentId) continue;
    const formattedPeer = formatRssiStream(peer, MAX_OUTLIERS_TRIM);
    if (!formattedPeer || formattedPeer.rssiData.length < MIN_SAMPLES) continue;

    const result = correlationService.computePearsonCorrelation(
      formattedTarget.rssiData,
      formattedPeer.rssiData
    );

    if (result.correlation === null) continue;

    const severity = correlationService.determineSeverity(result.correlation);
    const suspicious = correlationService.isSuspicious(result.correlation, result.stationaryCheck);

    if (suspicious.suspicious) {
      // Upsert anomaly
      const { anomalyId } = await upsertAnomaly({
        classId,
        sessionDate,
        student1: studentId,
        student2: peer.student_id,
        correlation: result.correlation,
        severity,
        dataPoints: result.dataPoints,
        notes: suspicious.description
      });

      bestFlag = {
        flagged: true,
        anomalyId,
        correlationScore: result.correlation,
        otherStudent: peer.student_id,
        message: `Attendance blocked: suspicious correlation with ${peer.student_id}. Please see your teacher.`
      };
      break; // block on first flag
    }
  }

  return bestFlag;
}

function formatRssiStream(stream, trimRatio) {
  const data = (stream.rssi_data || []).map(d => ({
    timestamp: d.timestamp || d.t,
    rssi: d.rssi ?? d.r
  })).filter(d => d.rssi !== undefined && d.timestamp);

  if (data.length === 0) return null;

  // Trim outliers
  const sorted = [...data].sort((a, b) => a.rssi - b.rssi);
  const trimCount = Math.floor(sorted.length * trimRatio);
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  const ordered = trimmed.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return { ...stream, rssiData: ordered };
}

async function upsertAnomaly({ classId, sessionDate, student1, student2, correlation, severity, dataPoints, notes }) {
  // Normalize ordering to avoid duplicates
  const [s1, s2] = [student1, student2].sort();

  // Check existing (either order)
  const { data: existingRows } = await supabaseAdmin
    .from('anomalies')
    .select('id, correlation_score')
    .eq('class_id', classId)
    .eq('session_date', sessionDate)
    .or(`and(student_id_1.eq.${s1},student_id_2.eq.${s2}),and(student_id_1.eq.${s2},student_id_2.eq.${s1})`)
    .limit(1);

  const existing = existingRows?.[0];

  if (existing) {
    if (correlation > existing.correlation_score) {
      await supabaseAdmin
        .from('anomalies')
        .update({
          correlation_score: correlation,
          severity: severity === 'critical' ? 'critical' : 'warning',
          notes,
          status: 'pending'
        })
        .eq('id', existing.id);
    }
    return { anomalyId: existing.id };
  }

  const { data: inserted } = await supabaseAdmin
    .from('anomalies')
    .insert({
      class_id: classId,
      session_date: sessionDate,
      student_id_1: s1,
      student_id_2: s2,
      correlation_score: correlation,
      severity: severity === 'critical' ? 'critical' : 'warning',
      status: 'pending',
      notes,
      created_at: new Date().toISOString()
    })
    .select('id')
    .single();

  return { anomalyId: inserted?.id };
}

/**
 * Cancel provisional attendance
 */
exports.cancelProvisional = async (req, res) => {
  try {
    const { studentId, classId, eventId, deviceSignature, deviceSaltVersion = 'v1', deviceIdHash, deviceId: legacyDeviceId } = req.body;
    const deviceId = deviceIdHash || legacyDeviceId || null;

    if (!studentId || !classId || !eventId || !deviceId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { valid: signatureValid } = verifyDeviceSignature({ deviceId, signature: deviceSignature, version: deviceSaltVersion });
    if (!signatureValid) {
      return res.status(401).json({ success: false, error: 'INVALID_DEVICE_SIGNATURE' });
    }

    const today = new Date().toISOString().split('T')[0];
    const scope = `cancel:${studentId}:${classId}:${today}`;
    const requestHash = stableHash({ studentId, classId, deviceId, eventId });
    const existingKey = await findKey(eventId, scope);

    if (existingKey) {
      if (existingKey.request_hash !== requestHash) {
        return res.status(409).json({ success: false, error: 'IDEMPOTENCY_CONFLICT' });
      }
      return res.status(existingKey.status_code || 200).json(existingKey.response || { success: true, message: 'Already cancelled' });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('attendance')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: 'Student left classroom before confirmation'
      })
      .eq('student_id', studentId)
      .eq('class_id', classId)
      .eq('session_date', today)
      .eq('status', 'provisional')
      .select()
      .single();

    if (error || !updated) {
      return res.status(404).json({ error: 'No provisional attendance found' });
    }

    console.log(`🚫 Cancelled provisional attendance for ${studentId} in ${classId}`);

    const responseBody = {
      success: true,
      message: 'Provisional attendance cancelled',
      attendance: { id: updated.id, status: updated.status }
    };

    await persistKey({ eventId, scope, requestHash, response: responseBody, statusCode: 200 });

    res.status(200).json(responseBody);

  } catch (error) {
    console.error('❌ Cancel error:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel attendance' });
  }
};

/**
 * Get today's attendance for student
 */
exports.getTodayAttendance = async (req, res) => {
  try {
    const { studentId } = req.params;
    const today = new Date().toISOString().split('T')[0];

    const { data: attendance, error } = await supabaseAdmin
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .eq('session_date', today)
      .order('check_in_time', { ascending: false });

    if (error) throw error;

    const confirmationWindowSeconds = CONFIRMATION_WINDOW_SECONDS;
    const now = new Date();

    const formatted = (attendance || []).map(record => {
      const base = {
        attendanceId: record.id,
        studentId: record.student_id,
        classId: record.class_id,
        status: record.status,
        checkInTime: record.check_in_time,
        confirmedAt: record.confirmed_at,
        cancelledAt: record.cancelled_at,
        deviceId: record.device_id,
        rssi: record.rssi,
        distance: record.distance
      };

      if (record.status === 'provisional' && record.check_in_time) {
        const elapsed = Math.floor((now.getTime() - new Date(record.check_in_time).getTime()) / 1000);
        base.remainingSeconds = Math.max(confirmationWindowSeconds - elapsed, 0);
      }

      return base;
    });

    res.status(200).json({
      success: true,
      studentId,
      date: today,
      count: formatted.length,
      attendance: formatted
    });

  } catch (error) {
    console.error('❌ Get today attendance error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch attendance' });
  }
};

/**
 * Query attendance records
 */
exports.queryAttendance = async (req, res) => {
  try {
    const { studentId, classId, date, status, limit = 100 } = req.query;

    let query = supabaseAdmin.from('attendance').select('*');

    if (studentId) query = query.eq('student_id', studentId);
    if (classId) query = query.eq('class_id', classId);
    if (status) query = query.eq('status', status);
    if (date) query = query.eq('session_date', date);

    const { data: attendance, error } = await query
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.status(200).json({ count: attendance?.length || 0, attendance: attendance || [] });

  } catch (error) {
    console.error('❌ Query attendance error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
};

/**
 * Get attendance for specific class
 */
exports.getClassAttendance = async (req, res) => {
  try {
    const { classId } = req.params;
    const { date, status } = req.query;

    let query = supabaseAdmin
      .from('attendance')
      .select('*')
      .eq('class_id', classId);

    if (status) query = query.eq('status', status);
    if (date) query = query.eq('session_date', date);

    const { data: attendance, error } = await query.order('check_in_time', { ascending: false });

    if (error) throw error;

    res.status(200).json({
      classId,
      count: attendance?.length || 0,
      attendance: attendance || []
    });

  } catch (error) {
    console.error('❌ Get class attendance error:', error);
    res.status(500).json({ error: 'Failed to fetch class attendance' });
  }
};

/**
 * Upload RSSI stream data (for correlation analysis)
 */
exports.uploadRssiStream = async (req, res) => {
  try {
    const { studentId, classId, rssiData } = req.body;

    if (!studentId || !classId || !rssiData) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const today = new Date().toISOString().split('T')[0];

    // Check if stream exists for today
    const { data: existing } = await supabaseAdmin
      .from('rssi_streams')
      .select('id, rssi_data, sample_count')
      .eq('student_id', studentId)
      .eq('class_id', classId)
      .eq('session_date', today)
      .single();

    if (existing) {
      // Append to existing stream
      const updatedData = [...(existing.rssi_data || []), ...rssiData];
      await supabaseAdmin
        .from('rssi_streams')
        .update({
          rssi_data: updatedData,
          sample_count: updatedData.length
        })
        .eq('id', existing.id);
    } else {
      // Create new stream
      await supabaseAdmin
        .from('rssi_streams')
        .insert({
          student_id: studentId,
          class_id: classId,
          session_date: today,
          rssi_data: rssiData,
          sample_count: rssiData.length
        });
    }

    res.status(200).json({ success: true, message: 'RSSI data uploaded' });

  } catch (error) {
    console.error('❌ RSSI upload error:', error);
    res.status(500).json({ error: 'Failed to upload RSSI data' });
  }
};

/**
 * Manual attendance entry (for teachers)
 */
exports.manualEntry = async (req, res) => {
  try {
    const { studentId, classId, date, status, notes } = req.body;

    if (!studentId || !classId || !date || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if attendance already exists
    const { data: existing } = await supabaseAdmin
      .from('attendance')
      .select('id')
      .eq('student_id', studentId)
      .eq('class_id', classId)
      .eq('session_date', date)
      .single();

    if (existing) {
      // Update existing
      const { data: updated } = await supabaseAdmin
        .from('attendance')
        .update({
          status: status === 'present' ? 'confirmed' : status,
          is_manual: true,
          cancellation_reason: notes || 'Manual entry by teacher'
        })
        .eq('id', existing.id)
        .select()
        .single();

      return res.json({ success: true, message: 'Attendance updated', attendance: updated });
    }

    // Create new manual entry
    const { data: attendance, error } = await supabaseAdmin
      .from('attendance')
      .insert({
        student_id: studentId,
        class_id: classId,
        session_date: date,
        status: status === 'present' ? 'confirmed' : 'manual',
        is_manual: true,
        device_id: 'MANUAL_ENTRY',
        cancellation_reason: notes || 'Manual entry by teacher'
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, message: 'Manual attendance recorded', attendance });

  } catch (error) {
    console.error('❌ Manual entry error:', error);
    res.status(500).json({ error: 'Failed to record manual attendance' });
  }
};

/**
 * Get attendance history with filters
 */
exports.getHistory = async (req, res) => {
  try {
    const { classId, startDate, endDate, studentId } = req.query;

    let query = supabaseAdmin.from('attendance').select('*');

    if (classId) query = query.eq('class_id', classId);
    if (studentId) query = query.eq('student_id', studentId);
    if (startDate) query = query.gte('session_date', startDate);
    if (endDate) query = query.lte('session_date', endDate);

    const { data: attendance, error } = await query.order('session_date', { ascending: false });

    if (error) throw error;

    // Calculate summary
    const summary = {
      total: attendance?.length || 0,
      confirmed: attendance?.filter(a => a.status === 'confirmed').length || 0,
      provisional: attendance?.filter(a => a.status === 'provisional').length || 0,
      cancelled: attendance?.filter(a => a.status === 'cancelled').length || 0,
      manual: attendance?.filter(a => a.is_manual).length || 0
    };

    res.json({ attendance: attendance || [], summary });

  } catch (error) {
    console.error('❌ Get history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
};

/**
 * Get ALL today's attendance (simplified demo mode - no session activator needed)
 * Shows all attendance records for today across all classes
 */
exports.getTodayAllAttendance = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Get all attendance for today with student info
    const { data: attendance, error } = await supabaseAdmin
      .from('attendance')
      .select('*')
      .eq('session_date', today)
      .order('check_in_time', { ascending: false });

    if (error) throw error;

    // Get student names for display
    const studentIds = [...new Set((attendance || []).map(a => a.student_id))];
    let studentMap = {};
    
    if (studentIds.length > 0) {
      const { data: students } = await supabaseAdmin
        .from('students')
        .select('student_id, name')
        .in('student_id', studentIds);
      
      studentMap = (students || []).reduce((acc, s) => {
        acc[s.student_id] = s.name;
        return acc;
      }, {});
    }

    // Format response
    const formatted = (attendance || []).map(record => ({
      id: record.id,
      studentId: record.student_id,
      studentName: studentMap[record.student_id] || record.student_id,
      classId: record.class_id,
      status: record.status,
      checkInTime: record.check_in_time,
      confirmedAt: record.confirmed_at,
      rssi: record.rssi,
      distance: record.distance,
      cancellationReason: record.cancellation_reason
    }));

    // Summary stats
    const summary = {
      total: formatted.length,
      confirmed: formatted.filter(a => a.status === 'confirmed').length,
      provisional: formatted.filter(a => a.status === 'provisional').length,
      cancelled: formatted.filter(a => a.status === 'cancelled').length
    };

    res.status(200).json({
      success: true,
      date: today,
      summary,
      attendance: formatted
    });

  } catch (error) {
    console.error('❌ Get today all attendance error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch attendance' });
  }
};
