/**
 * 👤 Student Controller
 * 
 * Business logic for student management
 */

const Student = require('../models/Student');

/**
 * Validate device before login
 * Prevents locked users from accessing app
 */
exports.validateDevice = async (req, res) => {
  try {
    const { studentId, deviceId } = req.body;

    // Validation
    if (!studentId || !deviceId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['studentId', 'deviceId']
      });
    }

    console.log(`🔐 VALIDATING LOGIN: Student ${studentId} on device ${deviceId.substring(0, 8)}...`);

    // Check if this device is already registered to ANY student
    const existingDeviceUser = await Student.findOne({ deviceId });
    
    if (existingDeviceUser) {
      if (existingDeviceUser.studentId !== studentId) {
        // Device is locked to DIFFERENT student - BLOCK LOGIN
        console.log(`❌ LOGIN BLOCKED: Device locked to student ${existingDeviceUser.studentId}`);
        return res.status(403).json({
          canLogin: false,
          error: 'Device already registered',
          message: `This device is already linked to student ID: ${existingDeviceUser.studentId}`,
          lockedToStudent: existingDeviceUser.studentId,
          lockedSince: existingDeviceUser.deviceRegisteredAt
        });
      } else {
        // Device is registered to THIS student - ALLOW LOGIN
        console.log(`✅ LOGIN ALLOWED: Device verified for student ${studentId}`);
        return res.status(200).json({
          canLogin: true,
          message: 'Welcome back!'
        });
      }
    } else {
      // Device is NOT registered to anyone - ALLOW LOGIN
      console.log(`✅ LOGIN ALLOWED: New device for student ${studentId}`);
      return res.status(200).json({
        canLogin: true,
        message: 'Device will be registered on first check-in'
      });
    }

  } catch (error) {
    console.error('❌ Device validation error:', error);
    res.status(500).json({ 
      error: 'Device validation failed',
      details: error.message 
    });
  }
};

/**
 * Register new student
 */
exports.registerStudent = async (req, res) => {
  try {
    const { studentId, name, email, deviceId } = req.body;

    // Validation
    if (!studentId || !name) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['studentId', 'name']
      });
    }

    // Check if student already exists
    const existingStudent = await Student.findOne({ studentId });
    if (existingStudent) {
      return res.status(409).json({
        error: 'Student already exists',
        message: `Student ID ${studentId} is already registered`
      });
    }

    // Check if device already registered
    if (deviceId) {
      const existingDevice = await Student.findOne({ deviceId });
      if (existingDevice) {
        return res.status(409).json({
          error: 'Device already registered',
          message: `This device is already linked to student ${existingDevice.studentId}`
        });
      }
    }

    // Create student
    const student = new Student({
      studentId,
      name,
      email: email || null,
      deviceId: deviceId || null,
      deviceRegisteredAt: deviceId ? new Date() : null
    });

    await student.save();

    console.log(`✨ Student registered: ${studentId} (${name})`);

    res.status(201).json({
      message: 'Student registered successfully',
      student: {
        id: student._id,
        studentId: student.studentId,
        name: student.name,
        email: student.email,
        deviceRegistered: !!student.deviceId
      }
    });

  } catch (error) {
    console.error('❌ Student registration error:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Duplicate entry',
        message: 'Student ID or device ID already exists'
      });
    }
    
    res.status(500).json({
      error: 'Registration failed',
      details: error.message
    });
  }
};

/**
 * Get student by ID
 */
exports.getStudentById = async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findOne({ studentId })
      .select('-__v');

    if (!student) {
      return res.status(404).json({
        error: 'Student not found',
        message: `No student found with ID: ${studentId}`
      });
    }

    res.status(200).json({
      student
    });

  } catch (error) {
    console.error('❌ Get student error:', error);
    res.status(500).json({
      error: 'Failed to fetch student',
      details: error.message
    });
  }
};

/**
 * 🔓 Reset Device Binding (Admin/Teacher Only)
 * 
 * Allows a teacher/admin to unbind a student's device.
 * Use case: Student gets a new phone or factory resets their device.
 * 
 * Security: Requires teacher authentication
 */
exports.resetDeviceBinding = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { reason } = req.body;
    const teacherId = req.teacher?._id || req.admin?._id || 'system';
    const teacherName = req.teacher?.name || req.admin?.email || 'System';

    // Validation
    if (!studentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing studentId parameter'
      });
    }

    // Find the student
    const student = await Student.findOne({ studentId });

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found',
        message: `No student found with ID: ${studentId}`
      });
    }

    // Check if device binding exists
    if (!student.deviceId) {
      return res.status(400).json({
        success: false,
        error: 'No device binding',
        message: `Student ${studentId} has no device binding to reset`
      });
    }

    // Store old device info for logging
    const previousDeviceId = student.deviceId;
    const previousBindingDate = student.deviceRegisteredAt;

    // Clear the device binding
    student.deviceId = null;
    student.deviceRegisteredAt = null;
    await student.save();

    // Log the action
    console.log(`🔓 DEVICE BINDING RESET:`);
    console.log(`   Student: ${studentId} (${student.name})`);
    console.log(`   Previous Device: ${previousDeviceId}`);
    console.log(`   Bound Since: ${previousBindingDate}`);
    console.log(`   Reset By: ${teacherName} (${teacherId})`);
    console.log(`   Reason: ${reason || 'Not specified'}`);
    console.log(`   Time: ${new Date().toISOString()}`);

    res.status(200).json({
      success: true,
      message: `Device binding reset for student ${studentId}`,
      details: {
        studentId: student.studentId,
        studentName: student.name,
        previousDeviceId: previousDeviceId.substring(0, 8) + '...', // Partial for security
        previousBindingDate,
        resetBy: teacherName,
        resetAt: new Date(),
        reason: reason || 'Not specified'
      }
    });

  } catch (error) {
    console.error('❌ Reset device binding error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset device binding',
      details: error.message
    });
  }
};

/**
 * 📋 Get All Device Bindings (Admin/Teacher Only)
 * 
 * Lists all students with their device binding status.
 * Useful for admin dashboard to identify locked-out students.
 */
exports.getDeviceBindings = async (req, res) => {
  try {
    const { status } = req.query; // 'bound', 'unbound', 'all'

    let query = {};
    if (status === 'bound') {
      query.deviceId = { $ne: null };
    } else if (status === 'unbound') {
      query.deviceId = null;
    }

    const students = await Student.find(query)
      .select('studentId name deviceId deviceRegisteredAt isActive')
      .sort({ studentId: 1 });

    const summary = {
      total: students.length,
      bound: students.filter(s => s.deviceId).length,
      unbound: students.filter(s => !s.deviceId).length
    };

    res.status(200).json({
      success: true,
      summary,
      students: students.map(s => ({
        studentId: s.studentId,
        name: s.name,
        hasDeviceBinding: !!s.deviceId,
        deviceIdPrefix: s.deviceId ? s.deviceId.substring(0, 8) + '...' : null,
        boundSince: s.deviceRegisteredAt,
        isActive: s.isActive
      }))
    });

  } catch (error) {
    console.error('❌ Get device bindings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch device bindings',
      details: error.message
    });
  }
};
