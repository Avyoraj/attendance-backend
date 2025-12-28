/**
 * Attendance Controller (Supabase Version)
 * 
 * Business logic for attendance check-in, confirmation, and queries
 */

const { supabaseAdmin } = require('../utils/supabase');

/**
 * Check-in (provisional attendance)
 */
exports.checkIn = async (req, res) => {
  try {
    const { studentId, classId, deviceIdHash, deviceId: legacyDeviceId, rssi, distance, beaconMajor, beaconMinor } = req.body;
    const deviceId = deviceIdHash || legacyDeviceId || null;

    if (!studentId || !classId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['studentId', 'classId']
      });
    }

    const today = new Date().toISOString().split('T')[0];

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
      const confirmationWindowSeconds = 3 * 60;
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

    res.status(201).json({
      success: true,
      message: 'Attendance recorded successfully',
      status: 'provisional',
      remainingSeconds: 180,
      attendance: {
        id: attendance.id,
        studentId: attendance.student_id,
        classId: attendance.class_id,
        status: attendance.status,
        checkInTime: attendance.check_in_time,
        rssi: attendance.rssi
      }
    });

  } catch (error) {
    console.error('❌ Check-in error:', error);
    res.status(500).json({ success: false, error: 'Failed to record attendance' });
  }
};


/**
 * Confirm provisional attendance
 */
exports.confirmAttendance = async (req, res) => {
  try {
    const { studentId, classId, attendanceId, deviceIdHash, deviceId: legacyDeviceId } = req.body;
    const deviceId = deviceIdHash || legacyDeviceId || null;

    if (!studentId || !classId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const today = new Date().toISOString().split('T')[0];

    // Find attendance record
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

    console.log(`✅ Attendance confirmed: ${studentId} in ${classId}`);

    res.status(200).json({
      success: true,
      message: 'Attendance confirmed successfully',
      attendance: {
        id: updated.id,
        status: updated.status,
        checkInTime: updated.check_in_time,
        confirmedAt: updated.confirmed_at
      }
    });

  } catch (error) {
    console.error('❌ Confirmation error:', error);
    res.status(500).json({ success: false, error: 'Failed to confirm attendance' });
  }
};

/**
 * Cancel provisional attendance
 */
exports.cancelProvisional = async (req, res) => {
  try {
    const { studentId, classId } = req.body;

    if (!studentId || !classId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const today = new Date().toISOString().split('T')[0];

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

    res.status(200).json({
      success: true,
      message: 'Provisional attendance cancelled',
      attendance: { id: updated.id, status: updated.status }
    });

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

    const confirmationWindowSeconds = 180;
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
      distance: record.distance
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
