/**
 * Auth Routes
 * 
 * Handles teacher and admin authentication
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Teacher = require('../models/Teacher');
const Admin = require('../models/Admin');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Teacher/Admin Login
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Admin login
    if (role === 'admin') {
      const admin = await Admin.findOne({ email }).select('+password_hash');
      if (!admin) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValid = await bcrypt.compare(password, admin.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { id: admin._id, email: admin.email, name: admin.name, role: 'admin' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.json({
        token,
        user: {
          id: admin._id,
          email: admin.email,
          name: admin.name,
          role: 'admin'
        }
      });
    }

    // Teacher login (default)
    const teacher = await Teacher.findOne({ email }).select('+password_hash');
    if (!teacher) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, teacher.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!teacher.isActive) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    const token = jwt.sign(
      { id: teacher._id, email: teacher.email, name: teacher.name, role: 'teacher' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: teacher._id,
        email: teacher.email,
        name: teacher.name,
        department: teacher.department,
        role: 'teacher'
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * Register new teacher
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, department, role } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Check if email exists
    const existingTeacher = await Teacher.findOne({ email });
    if (existingTeacher) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Admin registration
    if (role === 'admin') {
      const admin = new Admin({
        email,
        password_hash: passwordHash,
        name,
        role: 'admin'
      });
      await admin.save();

      return res.status(201).json({
        message: 'Admin registered successfully',
        user: { id: admin._id, email: admin.email, name: admin.name, role: 'admin' }
      });
    }

    // Teacher registration
    const teacher = new Teacher({
      email,
      password_hash: passwordHash,
      name,
      department: department || 'General',
      isVerified: false,
      isActive: true
    });

    await teacher.save();

    res.status(201).json({
      message: 'Teacher registered successfully',
      user: {
        id: teacher._id,
        email: teacher.email,
        name: teacher.name,
        department: teacher.department
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * Verify token / Get current user
 * GET /api/auth/me
 */
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Try teacher first
    let user = await Teacher.findById(decoded.id).select('-password_hash');
    let role = 'teacher';

    if (!user) {
      user = await Admin.findById(decoded.id).select('-password_hash');
      role = 'admin';
    }

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role,
        department: user.department
      }
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('Auth check error:', error);
    res.status(500).json({ error: 'Authentication check failed' });
  }
});

module.exports = router;
