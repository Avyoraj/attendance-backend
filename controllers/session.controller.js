/**
 * Session Controller (Supabase Version)
 * 
 * Handles the "Session Activator" flow:
 * - Teacher starts a class (creates active session)
 * - Flutter app queries active session by beacon
 * - Teacher ends the class
 */

const { supabaseAdmin } = require('../utils/supabase');

/**
 * Start a new class session
 * POST /api/sessions/start
 */
exports.startSession = async (req, res) => {
  try {
    const { roomId, classId } = req.body;
    const teacherId = req.user?.id;
    const teacherName = req.user?.name || 'Unknown Teacher';

    if (!roomId || !classId) {
      return res.status(400).json({ error: 'roomId and classId are required' });
    }

    // Get room info
    const { data: room, error: roomError } = await supabaseAdmin
      .from('rooms')
      .select('*')
      .eq('room_id', roomId)
      .single();

    if (roomError || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Get class info
    const { data: classInfo, error: classError } = await supabaseAdmin
      .from('classes')
      .select('*')
      .eq('class_id', classId)
      .single();

    if (classError || !classInfo) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Check for existing active session in this room
    const { data: existingSession } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('room_id', roomId)
      .eq('status', 'active')
      .single();

    if (existingSession) {
      return res.status(409).json({
        error: 'Room already has an active session',
        activeSession: {
          sessionId: existingSession.id,
          className: existingSession.class_name,
          teacherName: existingSession.teacher_name,
          startedAt: existingSession.actual_start
        }
      });
    }

    // Create new session
    const { data: session, error: insertError } = await supabaseAdmin
      .from('sessions')
      .insert({
        room_id: roomId,
        class_id: classId,
        class_name: classInfo.name,
        teacher_id: teacherId,
        teacher_name: teacherName,
        beacon_major: room.beacon_major,
        beacon_minor: room.beacon_minor,
        status: 'active'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return res.status(500).json({ error: 'Failed to create session' });
    }

    console.log(`✅ Session started: ${classInfo.name} in ${room.name} by ${teacherName}`);

    res.status(201).json({
      message: 'Session started successfully',
      session: {
        sessionId: session.id,
        roomId: session.room_id,
        roomName: room.name,
        classId: session.class_id,
        className: session.class_name,
        teacherName: session.teacher_name,
        beaconMajor: session.beacon_major,
        beaconMinor: session.beacon_minor,
        startedAt: session.actual_start,
        status: session.status
      }
    });

  } catch (error) {
    console.error('❌ Start session error:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
};

/**
 * End an active session
 * POST /api/sessions/end
 */
exports.endSession = async (req, res) => {
  try {
    const { sessionId, roomId } = req.body;

    if (!sessionId && !roomId) {
      return res.status(400).json({ error: 'sessionId or roomId is required' });
    }

    // Find the session
    let query = supabaseAdmin.from('sessions').select('*').eq('status', 'active');
    if (sessionId) {
      query = query.eq('id', sessionId);
    } else {
      query = query.eq('room_id', roomId);
    }

    const { data: session, error: findError } = await query.single();

    if (findError || !session) {
      return res.status(404).json({ error: 'Active session not found' });
    }

    // Get attendance stats
    const { data: attendance } = await supabaseAdmin
      .from('attendance')
      .select('status')
      .eq('class_id', session.class_id)
      .eq('session_date', session.session_date);

    const stats = {
      total: attendance?.length || 0,
      confirmed: attendance?.filter(a => a.status === 'confirmed').length || 0,
      provisional: attendance?.filter(a => a.status === 'provisional').length || 0
    };

    // Update session
    const { data: updatedSession, error: updateError } = await supabaseAdmin
      .from('sessions')
      .update({
        status: 'ended',
        actual_end: new Date().toISOString(),
        stats
      })
      .eq('id', session.id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: 'Failed to end session' });
    }

    console.log(`✅ Session ended: ${session.class_name} - ${stats.confirmed} confirmed`);

    res.json({
      message: 'Session ended successfully',
      session: {
        sessionId: updatedSession.id,
        className: updatedSession.class_name,
        duration: Math.round((new Date(updatedSession.actual_end) - new Date(updatedSession.actual_start)) / 1000 / 60),
        stats
      }
    });

  } catch (error) {
    console.error('❌ End session error:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
};

/**
 * Get active session by beacon (for Flutter app)
 * GET /api/sessions/active/beacon/:major/:minor
 * 
 * DEMO MODE: If no active session exists, auto-creates one for smooth demo
 */
exports.getActiveSessionByBeacon = async (req, res) => {
  try {
    const major = parseInt(req.params.major);
    const minor = parseInt(req.params.minor);
    const demoMode = req.query.demo === 'true' || process.env.DEMO_MODE === 'true';

    if (isNaN(major) || isNaN(minor)) {
      return res.status(400).json({ error: 'Invalid beacon major/minor' });
    }

    // First, try to find an existing active session
    const { data: session, error } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('beacon_major', major)
      .eq('beacon_minor', minor)
      .eq('status', 'active')
      .single();

    if (session) {
      // Active session found - return it
      return res.json({
        hasActiveSession: true,
        session: {
          sessionId: session.id,
          classId: session.class_id,
          className: session.class_name,
          teacherName: session.teacher_name,
          roomId: session.room_id,
          startedAt: session.actual_start
        }
      });
    }

    // No active session - check if demo mode should auto-create one
    if (demoMode || process.env.DEMO_MODE === 'true') {
      console.log(`🎯 DEMO MODE: No active session for beacon ${major}/${minor}, auto-creating...`);
      
      // Find the room for this beacon
      const { data: room } = await supabaseAdmin
        .from('rooms')
        .select('*')
        .eq('beacon_major', major)
        .eq('beacon_minor', minor)
        .single();

      if (!room) {
        return res.status(404).json({
          error: 'No active session',
          message: 'No room configured for this beacon',
          demoMode: true
        });
      }

      // Find a class to use (first available or create demo class)
      let classInfo;
      const { data: classes } = await supabaseAdmin
        .from('classes')
        .select('*')
        .eq('is_active', true)
        .limit(1);

      if (classes && classes.length > 0) {
        classInfo = classes[0];
      } else {
        // Create a demo class
        const { data: newClass } = await supabaseAdmin
          .from('classes')
          .insert({
            class_id: 'DEMO_CLASS',
            name: 'Demo Class',
            subject: 'Demo Subject',
            is_active: true
          })
          .select()
          .single();
        classInfo = newClass;
      }

      if (!classInfo) {
        return res.status(404).json({
          error: 'No active session',
          message: 'Could not create demo session - no class available',
          demoMode: true
        });
      }

      // Auto-create a demo session
      const { data: demoSession, error: createError } = await supabaseAdmin
        .from('sessions')
        .insert({
          room_id: room.room_id,
          class_id: classInfo.class_id,
          class_name: classInfo.name,
          teacher_id: null,
          teacher_name: 'Demo Teacher (Auto)',
          beacon_major: major,
          beacon_minor: minor,
          status: 'active'
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ Failed to create demo session:', createError);
        return res.status(404).json({
          error: 'No active session',
          message: 'Failed to create demo session'
        });
      }

      console.log(`✅ DEMO MODE: Auto-created session for ${classInfo.name} in ${room.name}`);

      return res.json({
        hasActiveSession: true,
        demoMode: true,
        autoCreated: true,
        session: {
          sessionId: demoSession.id,
          classId: demoSession.class_id,
          className: demoSession.class_name,
          teacherName: demoSession.teacher_name,
          roomId: demoSession.room_id,
          startedAt: demoSession.actual_start
        }
      });
    }

    // No session and not in demo mode
    return res.status(404).json({
      error: 'No active session',
      message: 'No class is currently in progress in this room. Ask your teacher to start the session.'
    });

  } catch (error) {
    console.error('❌ Get active session error:', error);
    res.status(500).json({ error: 'Failed to get active session' });
  }
};

/**
 * Get teacher's sessions for today
 * GET /api/sessions/today
 */
exports.getTodaySessions = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const today = new Date().toISOString().split('T')[0];

    let query = supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('session_date', today)
      .order('actual_start', { ascending: false });

    if (teacherId) {
      query = query.eq('teacher_id', teacherId);
    }

    const { data: sessions, error } = await query;

    if (error) {
      return res.status(500).json({ error: 'Failed to get sessions' });
    }

    res.json({ sessions: sessions || [] });

  } catch (error) {
    console.error('❌ Get today sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
};

/**
 * Get all rooms
 * GET /api/sessions/rooms
 */
exports.getRooms = async (req, res) => {
  try {
    const { data: rooms, error } = await supabaseAdmin
      .from('rooms')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      return res.status(500).json({ error: 'Failed to get rooms' });
    }

    res.json({ rooms: rooms || [] });

  } catch (error) {
    console.error('❌ Get rooms error:', error);
    res.status(500).json({ error: 'Failed to get rooms' });
  }
};

/**
 * Get all classes
 * GET /api/sessions/classes
 */
exports.getClasses = async (req, res) => {
  try {
    const { data: classes, error } = await supabaseAdmin
      .from('classes')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      return res.status(500).json({ error: 'Failed to get classes' });
    }

    res.json({ classes: classes || [] });

  } catch (error) {
    console.error('❌ Get classes error:', error);
    res.status(500).json({ error: 'Failed to get classes' });
  }
};

/**
 * Get session attendance details
 * GET /api/sessions/:sessionId/attendance
 */
exports.getSessionAttendance = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { data: attendance, error: attError } = await supabaseAdmin
      .from('attendance')
      .select('*')
      .eq('class_id', session.class_id)
      .eq('session_date', session.session_date)
      .order('check_in_time');

    res.json({
      session: {
        sessionId: session.id,
        className: session.class_name,
        teacherName: session.teacher_name,
        status: session.status,
        startedAt: session.actual_start,
        endedAt: session.actual_end
      },
      attendance: attendance || [],
      summary: {
        total: attendance?.length || 0,
        confirmed: attendance?.filter(a => a.status === 'confirmed').length || 0,
        provisional: attendance?.filter(a => a.status === 'provisional').length || 0,
        cancelled: attendance?.filter(a => a.status === 'cancelled').length || 0
      }
    });

  } catch (error) {
    console.error('❌ Get session attendance error:', error);
    res.status(500).json({ error: 'Failed to get attendance' });
  }
};
