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
    const { studentId, classId, deviceId, rssi, distance, beaconMajor, beaconMinor } = req.body;

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
            error: 'Device already registered',
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
        error: 'Device mismatch',
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
      
      return res.status(200).json({
        message: 'Attendance updated',
        status: attendance.status,
        alreadyMarked: true,
        attendance: {
          id: attendance._id,
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

    res.status(201).json({
      message: 'Attendance recorded successfully',
      status: 'provisional',
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
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Duplicate attendance',
        message: 'Attendance already marked for this class today'
      });
    }
    
    res.status(500).json({ 
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
    const { studentId, classId } = req.body;

    if (!studentId || !classId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['studentId', 'classId']
      });
    }

    const today = new Date();
    const sessionDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const attendance = await Attendance.findOne({
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

    attendance.status = 'confirmed';
    attendance.confirmedAt = new Date();
    await attendance.save();

    console.log(`✅ Attendance confirmed: ${studentId} in ${classId}`);

    res.status(200).json({
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
    });

    res.status(200).json({
      date: sessionDate,
      count: attendance.length,
      attendance
    });

  } catch (error) {
    console.error('❌ Get today attendance error:', error);
    res.status(500).json({ 
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
