/**
 * Auth Controller (Supabase Version)
 * 
 * Handles teacher authentication using Supabase Auth
 */

const { supabase, supabaseAdmin } = require('../utils/supabase');

/**
 * Register a new teacher
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const { email, password, name, role = 'teacher' } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Use admin API to create user (bypasses email confirmation)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for development
      user_metadata: { name, role }
    });

    if (authError) {
      console.error('Supabase auth error:', authError);
      // Check if user already exists
      if (authError.message?.includes('already been registered')) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      return res.status(400).json({ error: authError.message });
    }

    // Create teacher record in our teachers table
    const { data: teacher, error: dbError } = await supabaseAdmin
      .from('teachers')
      .insert({
        auth_id: authData.user?.id,
        name,
        email,
        department: 'General'
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      // User created in auth but not in DB - still return success
    }

    console.log(`✅ Teacher registered: ${email}`);

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: teacher?.id || authData.user?.id,
        email,
        name,
        role
      }
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    // Check for network/timeout errors
    if (error.message?.includes('fetch failed') || error.code === 'UND_ERR_CONNECT_TIMEOUT') {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
    }
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};

/**
 * Login teacher
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Authenticate with Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      console.error('Login error:', authError);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get teacher record
    const { data: teacher } = await supabaseAdmin
      .from('teachers')
      .select('*')
      .eq('email', email)
      .single();

    console.log(`✅ Teacher logged in: ${email}`);

    res.json({
      message: 'Login successful',
      token: authData.session?.access_token,
      user: {
        id: teacher?.id || authData.user?.id,
        email,
        name: teacher?.name || authData.user?.user_metadata?.name || 'Teacher',
        role: 'teacher'
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    // Check for network/timeout errors
    if (error.message?.includes('fetch failed') || error.code === 'UND_ERR_CONNECT_TIMEOUT') {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
    }
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
};

/**
 * Get current user
 * GET /api/auth/me
 */
exports.getMe = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get teacher record
    const { data: teacher } = await supabaseAdmin
      .from('teachers')
      .select('*')
      .eq('email', user.email)
      .single();

    res.json({
      user: {
        id: teacher?.id || user.id,
        email: user.email,
        name: teacher?.name || user.user_metadata?.name || 'Teacher',
        role: 'teacher'
      }
    });

  } catch (error) {
    console.error('❌ Get me error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

/**
 * Logout
 * POST /api/auth/logout
 */
exports.logout = async (req, res) => {
  try {
    await supabase.auth.signOut();
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
};
