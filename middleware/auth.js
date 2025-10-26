const jwt = require('jsonwebtoken');
const Teacher = require('../models/Teacher');
const Admin = require('../models/Admin');

/**
 * Middleware to authenticate teacher requests using JWT
 * Extracts token from Authorization header and verifies it
 * Attaches teacher object to req.teacher if valid
 */
const authenticateTeacher = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Please login first.'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    // Check if teacher exists and is active
    const teacher = await Teacher.findById(decoded.id).select('-password_hash');
    
    if (!teacher) {
      return res.status(401).json({
        success: false,
        message: 'Teacher not found. Invalid token.'
      });
    }

    if (!teacher.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact admin.'
      });
    }

    // Attach teacher to request
    req.teacher = teacher;
    req.userId = teacher._id;
    req.userRole = 'teacher';

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please login again.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.'
      });
    }

    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed. Please try again.'
    });
  }
};

/**
 * Middleware to authenticate admin requests using JWT
 * Extracts token from Authorization header and verifies it
 * Attaches admin object to req.admin if valid
 */
const authenticateAdmin = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Please login first.'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    // Check if admin exists and is active
    const admin = await Admin.findById(decoded.id).select('-password_hash');
    
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Admin not found. Invalid token.'
      });
    }

    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact super admin.'
      });
    }

    // Attach admin to request
    req.admin = admin;
    req.userId = admin._id;
    req.userRole = 'admin';

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please login again.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.'
      });
    }

    console.error('Admin authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed. Please try again.'
    });
  }
};

/**
 * Middleware to authenticate either teacher or admin
 * Useful for endpoints accessible by both roles
 */
const authenticateUser = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Please login first.'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    // Try to find teacher first
    let user = await Teacher.findById(decoded.id).select('-password_hash');
    let role = 'teacher';

    // If not teacher, try admin
    if (!user) {
      user = await Admin.findById(decoded.id).select('-password_hash');
      role = 'admin';
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Invalid token.'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated.'
      });
    }

    // Attach user to request
    req.user = user;
    req.userId = user._id;
    req.userRole = role;

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please login again.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.'
      });
    }

    console.error('User authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed. Please try again.'
    });
  }
};

module.exports = {
  authenticateTeacher,
  authenticateAdmin,
  authenticateUser
};
