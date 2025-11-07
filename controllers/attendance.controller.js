/**
 * ✅ Attendance Controller
 * 
 * Business logic for attendance check-in, confirmation, and queries
 */

const Attendance = require('../models/Attendance');
const Student = require('../models/Student');

/**
 * Check-in (provisional attendance)
 */
exports.checkIn = async (req, res) => {
  try {
    // Accept both deviceIdHash (preferred) and deviceId (legacy)
    const { studentId, classId, deviceIdHash, deviceId: legacyDeviceId, rssi, distance, beaconMajor, beaconMinor } = req.body;
    const deviceId = deviceIdHash || legacyDeviceId || null;

    // Validation
    if (!studentId || !classId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['studentId', 'classId']
      });
    }

    // Get today's date (for uniqueness check)
    const today = new Date();
    const sessionDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // ✅ CRITICAL: Check device FIRST (before student creation)
    if (deviceId) {
      console.log(`🔍 Checking device availability: ${deviceId.substring(0, 8)}... for student ${studentId}`);
      
      // Check if this device is already registered to ANY student (including this one)
      const existingDeviceUser = await Student.findOne({ deviceId });
      
      if (existingDeviceUser) {
        // Device is already registered
        if (existingDeviceUser.studentId !== studentId) {
          // Registered to DIFFERENT student - BLOCK
          console.log(`❌ BLOCKED: Device ${deviceId.substring(0, 8)}... is locked to student ${existingDeviceUser.studentId}`);
          return res.status(403).json({
            success: false,
            error: 'DEVICE_MISMATCH',
            message: `This device is already linked to another student account (${existingDeviceUser.studentId})`,
            lockedToStudent: existingDeviceUser.studentId,
            lockedSince: existingDeviceUser.deviceRegisteredAt
          });
        } else {
          // Registered to THIS student - OK, continue
          console.log(`✅ Device verified for student ${studentId}`);
        }
      } else {
        console.log(`✅ Device ${deviceId.substring(0, 8)}... is available`);
      }
    }

    // Now safe to get/create student
    let student = await Student.findOne({ studentId });
    
    if (!student) {
      // New student - register device immediately
      student = new Student({
        studentId,
        name: `Student ${studentId}`,
        deviceId: deviceId || null,
        deviceRegisteredAt: deviceId ? new Date() : null
      });
      await student.save();
  console.log(`✨ Created new student: ${studentId} with device ${deviceId ? deviceId.substring(0, 8) + '...' : 'none'}`);
    } else if (!student.deviceId && deviceId) {
      // Existing student without device - register it now
      student.deviceId = deviceId;
      student.deviceRegisteredAt = new Date();
      await student.save();
      console.log(`🔒 Device ${deviceId.substring(0, 8)}... registered for existing student: ${studentId}`);
    }

    // Final verification: ensure device matches
    if (student.deviceId && deviceId && student.deviceId !== deviceId) {
      console.log(`❌ Device mismatch: Expected ${student.deviceId.substring(0, 8)}..., got ${deviceId.substring(0, 8)}...`);
      return res.status(403).json({
        success: false,
        error: 'DEVICE_MISMATCH',
        message: 'This account is linked to a different device'
      });
    }

    // Check for existing attendance today
    let attendance = await Attendance.findOne({
      studentId,
      classId,
      sessionDate
    });

    if (attendance) {
      // Update existing record (for confirmation or RSSI update)
      attendance.rssi = rssi || attendance.rssi;
      attendance.distance = distance || attendance.distance;
      
      if (attendance.status === 'provisional' && req.body.confirm === true) {
        attendance.status = 'confirmed';
        attendance.confirmedAt = new Date();
      }
      
      await attendance.save();

      // Compute remainingSeconds for confirmation window when provisional
      const confirmationWindowSeconds = 3 * 60; // keep in sync with client/docs
      const now = new Date();
      let remainingSeconds = 0;
      if (attendance.status === 'provisional' && attendance.checkInTime) {
        const elapsedSeconds = Math.floor((now.getTime() - attendance.checkInTime.getTime()) / 1000);
        remainingSeconds = Math.max(confirmationWindowSeconds - elapsedSeconds, 0);
      }

      return res.status(200).json({
        success: true,
        message: 'Attendance updated',
        status: attendance.status,
        alreadyMarked: true,
        remainingSeconds,
        attendance: {
          id: attendance._id,
          studentId: attendance.studentId,
          classId: attendance.classId,
          status: attendance.status,
          checkInTime: attendance.checkInTime,
          confirmedAt: attendance.confirmedAt
        }
      });
    }

    // Create new attendance record
    attendance = new Attendance({
      studentId,
      classId,
      deviceId: deviceId || student.deviceId,
      status: 'provisional', // Start as provisional
      rssi: rssi || -70, // Default if not provided
      distance: distance || null,
      beaconMajor: beaconMajor || null,
      beaconMinor: beaconMinor || null,
      sessionDate
    });

    await attendance.save();

    console.log(`✅ Attendance marked: ${studentId} in ${classId} (${attendance.status})`);

    // Remaining seconds for confirmation window
    const confirmationWindowSeconds = 3 * 60;
    res.status(201).json({
      success: true,
      message: 'Attendance recorded successfully',
      status: 'provisional',
      remainingSeconds: confirmationWindowSeconds,
      attendance: {
        id: attendance._id,
        studentId: attendance.studentId,
        classId: attendance.classId,
        status: attendance.status,
        checkInTime: attendance.checkInTime,
        rssi: attendance.rssi
      }
    });

  } catch (error) {
    console.error('❌ Check-in error:', error);
    
    // Handle duplicate key error idempotently: return existing record as success 200
    if (error.code === 11000) {
      try {
        const today = new Date();
        const sessionDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const { studentId, classId } = req.body;
        const existing = await Attendance.findOne({ studentId, classId, sessionDate });
        if (existing) {
          const confirmationWindowSeconds = 3 * 60;
          const now = new Date();
          let remainingSeconds = 0;
          if (existing.status === 'provisional' && existing.checkInTime) {
            const elapsedSeconds = Math.floor((now.getTime() - existing.checkInTime.getTime()) / 1000);
            remainingSeconds = Math.max(confirmationWindowSeconds - elapsedSeconds, 0);
          }
          return res.status(200).json({
            success: true,
            message: 'Attendance already recorded',
            status: existing.status,
            alreadyMarked: true,
            remainingSeconds,
            attendance: {
              id: existing._id,
              studentId: existing.studentId,
              classId: existing.classId,
              status: existing.status,
              checkInTime: existing.checkInTime,
              confirmedAt: existing.confirmedAt
            }
          });
        }
      } catch (e2) {
        console.error('❌ Idempotent fallback failed:', e2);
      }
      return res.status(200).json({ success: true, message: 'Attendance already recorded' });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to record attendance',
      details: error.message 
    });
  }
};

/**
 * Confirm provisional attendance
 */
exports.confirmAttendance = async (req, res) => {
  try {
    const { studentId, classId, attendanceId } = req.body;

    if (!studentId || !classId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['studentId', 'classId']
      });
    }

    const today = new Date();
    const sessionDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // FIX #2: Support direct lookup by attendance ID (more reliable)
    let attendance;
    if (attendanceId) {
      // Direct lookup by ID (fast, accurate)
      attendance = await Attendance.findById(attendanceId);
      
      if (!attendance) {
        return res.status(404).json({
          error: 'No provisional attendance found',
          message: 'Attendance ID not found'
        });
      }
      
      // Verify it's for the right student/class
      if (attendance.studentId !== studentId || attendance.classId !== classId) {
        return res.status(400).json({
          error: 'Attendance mismatch',
          message: 'Attendance ID does not match student/class'
        });
      }
    } else {
      // Fallback: Search by student/class/date (slower, less reliable)
      attendance = await Attendance.findOne({
        studentId,
        classId,
        sessionDate,
        status: 'provisional'
      });
      
      if (!attendance) {
        return res.status(404).json({
          error: 'No provisional attendance found',
          message: 'Cannot confirm attendance that does not exist or is already confirmed'
        });
      }
    }

    attendance.status = 'confirmed';
    attendance.confirmedAt = new Date();
    await attendance.save();

    console.log(`✅ Attendance confirmed: ${studentId} in ${classId} (ID: ${attendance._id})`);

    res.status(200).json({
      success: true,
      message: 'Attendance confirmed successfully',
      attendance: {
        id: attendance._id,
        status: attendance.status,
        checkInTime: attendance.checkInTime,
        confirmedAt: attendance.confirmedAt
      }
    });

  } catch (error) {
    console.error('❌ Confirmation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to confirm attendance',
      details: error.message 
    });
  }
};

/**
 * Cancel provisional attendance
 */
exports.cancelProvisional = async (req, res) => {
  try {
    const { studentId, classId } = req.body;

    if (!studentId || !classId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['studentId', 'classId']
      });
    }

    const today = new Date();
    const sessionDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Update status to 'cancelled' instead of deleting
    const result = await Attendance.findOneAndUpdate(
      {
        studentId,
        classId,
        sessionDate,
        status: 'provisional'
      },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: 'Student left classroom before confirmation period ended'
        }
      },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({
        error: 'No provisional attendance found',
        message: 'Cannot cancel attendance that does not exist or is already confirmed'
      });
    }

    console.log(`🚫 Cancelled provisional attendance for ${studentId} in ${classId}`);

    res.status(200).json({
      success: true,
      message: 'Provisional attendance cancelled',
      attendance: {
        id: result._id,
        status: result.status,
        cancelledAt: result.cancelledAt
      }
    });

  } catch (error) {
    console.error('❌ Cancel error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to cancel attendance',
      details: error.message 
    });
  }
};

/**
 * Get today's attendance for student
 */
exports.getTodayAttendance = async (req, res) => {
  try {
    const { studentId } = req.params;

    const today = new Date();
    const sessionDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const attendance = await Attendance.find({
      studentId,
      sessionDate
    }).sort({ checkInTime: -1 });

    const confirmationWindowSeconds = 3 * 60; // 3 minutes
    const cooldownWindowMinutes = 15;
    const now = new Date();

    const formattedAttendance = attendance.map(record => {
      const checkInTime = record.checkInTime;
      const confirmedAt = record.confirmedAt;
      const cancelledAt = record.cancelledAt;

      const base = {
        attendanceId: record._id.toString(),
        studentId: record.studentId,
        classId: record.classId,
        status: record.status,
        checkInTime: checkInTime ? checkInTime.toISOString() : null,
        confirmedAt: confirmedAt ? confirmedAt.toISOString() : null,
        cancelledAt: cancelledAt ? cancelledAt.toISOString() : null,
        cancellationReason: record.cancellationReason || null,
        deviceId: record.deviceId,
        rssi: record.rssi,
        distance: record.distance,
        beaconMajor: record.beaconMajor,
        beaconMinor: record.beaconMinor,
      };

      if (record.status === 'provisional' && checkInTime) {
        const elapsedSeconds = Math.floor((now.getTime() - checkInTime.getTime()) / 1000);
        const remainingSeconds = Math.max(confirmationWindowSeconds - elapsedSeconds, 0);
        base.remainingSeconds = remainingSeconds;
        base.confirmationExpiresAt = new Date(checkInTime.getTime() + confirmationWindowSeconds * 1000).toISOString();
      }

      if (record.status === 'confirmed') {
        const referenceTime = confirmedAt || checkInTime;
        if (referenceTime) {
          const cooldownEndsAt = new Date(referenceTime.getTime() + cooldownWindowMinutes * 60 * 1000);
          const secondsRemaining = Math.max(Math.floor((cooldownEndsAt.getTime() - now.getTime()) / 1000), 0);
          base.cooldown = {
            minutesRemaining: Math.max(Math.ceil(secondsRemaining / 60), 0),
            secondsRemaining,
            cooldownEndsAt: cooldownEndsAt.toISOString(),
          };
        }
      }

      return base;
    });

    res.status(200).json({
      success: true,
      studentId,
      date: sessionDate.toISOString(),
      count: formattedAttendance.length,
      attendance: formattedAttendance,
    });

  } catch (error) {
    console.error('❌ Get today attendance error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch attendance',
      details: error.message 
    });
  }
};

/**
 * Query attendance records
 */
exports.queryAttendance = async (req, res) => {
  try {
    const { studentId, classId, date, status, limit = 100 } = req.query;

    const query = {};
    
    if (studentId) query.studentId = studentId;
    if (classId) query.classId = classId;
    if (status) query.status = status;
    
    if (date) {
      const queryDate = new Date(date);
      const sessionDate = new Date(queryDate.getFullYear(), queryDate.getMonth(), queryDate.getDate());
      query.sessionDate = sessionDate;
    }

    const attendance = await Attendance
      .find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      count: attendance.length,
      attendance
    });

  } catch (error) {
    console.error('❌ Get attendance error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch attendance',
      details: error.message 
    });
  }
};

/**
 * Get attendance for specific class
 */
exports.getClassAttendance = async (req, res) => {
  try {
    const { classId } = req.params;
    const { date, status } = req.query;

    const query = { classId };
    
    if (status) query.status = status;
    
    if (date) {
      const queryDate = new Date(date);
      const sessionDate = new Date(queryDate.getFullYear(), queryDate.getMonth(), queryDate.getDate());
      query.sessionDate = sessionDate;
    }

    const attendance = await Attendance
      .find(query)
      .sort({ checkInTime: -1 });

    res.status(200).json({
      classId,
      count: attendance.length,
      attendance
    });

  } catch (error) {
    console.error('❌ Get class attendance error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch class attendance',
      details: error.message 
    });
  }
};
