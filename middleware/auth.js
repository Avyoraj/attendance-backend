/**
 * Auth Middleware (Supabase Version)
 * 
 * Validates Supabase JWT tokens for protected routes
 */

const { supabase, supabaseAdmin } = require('../utils/supabase');

/**
 * Middleware to authenticate teacher requests using Supabase JWT
 */
const authenticateTeacher = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Please login first.'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token. Please login again.'
      });
    }

    // Get teacher record from our database
    const { data: teacher } = await supabaseAdmin
      .from('teachers')
      .select('*')
      .eq('email', user.email)
      .single();

    // Attach user info to request
    req.user = {
      id: teacher?.id || user.id,
      authId: user.id,
      email: user.email,
      name: teacher?.name || user.user_metadata?.name || 'Teacher',
      role: 'teacher'
    };
    req.teacher = req.user;
    req.userId = req.user.id;
    req.userRole = 'teacher';

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed. Please try again.'
    });
  }
};

/**
 * Middleware to authenticate admin requests
 * For now, same as teacher auth (no separate admin in Supabase)
 */
const authenticateAdmin = authenticateTeacher;

/**
 * Middleware to authenticate either teacher or admin
 */
const authenticateUser = authenticateTeacher;

module.exports = {
  authenticateTeacher,
  authenticateAdmin,
  authenticateUser
};
