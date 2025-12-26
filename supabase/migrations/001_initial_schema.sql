-- =============================================
-- Frictionless BLE Attendance System
-- Supabase Database Schema Migration
-- =============================================

-- 1. TEACHERS TABLE
CREATE TABLE IF NOT EXISTS teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  department TEXT DEFAULT 'General',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. STUDENTS TABLE
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  year INTEGER,
  section TEXT,
  device_id TEXT UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. ROOMS TABLE (Beacon to Room mapping)
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  building TEXT,
  floor TEXT,
  capacity INTEGER DEFAULT 50,
  beacon_uuid TEXT DEFAULT '215d0698-0b3d-34a6-a844-5ce2b2447f1a',
  beacon_major INTEGER NOT NULL,
  beacon_minor INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(beacon_major, beacon_minor)
);

-- 4. CLASSES TABLE
CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  subject TEXT,
  teacher_id UUID REFERENCES teachers(id),
  room_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);


-- 5. SESSIONS TABLE (Session Activator - maps room to active class)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  class_name TEXT NOT NULL,
  teacher_id UUID REFERENCES teachers(id),
  teacher_name TEXT NOT NULL,
  beacon_major INTEGER NOT NULL,
  beacon_minor INTEGER NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'ended', 'cancelled')),
  actual_start TIMESTAMPTZ DEFAULT now(),
  actual_end TIMESTAMPTZ,
  session_date DATE DEFAULT CURRENT_DATE,
  stats JSONB DEFAULT '{"total": 0, "confirmed": 0, "provisional": 0}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Only one active session per room at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_session_per_room 
ON sessions(room_id) WHERE status = 'active';

-- 6. ATTENDANCE TABLE
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  session_id UUID REFERENCES sessions(id),
  device_id TEXT NOT NULL,
  status TEXT DEFAULT 'provisional' CHECK (status IN ('provisional', 'confirmed', 'cancelled', 'manual')),
  check_in_time TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  rssi INTEGER,
  distance NUMERIC(5,2),
  beacon_major INTEGER,
  beacon_minor INTEGER,
  session_date DATE DEFAULT CURRENT_DATE,
  is_manual BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, class_id, session_date)
);

-- 7. RSSI STREAMS TABLE (for correlation analysis)
CREATE TABLE IF NOT EXISTS rssi_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  session_date DATE DEFAULT CURRENT_DATE,
  rssi_data JSONB NOT NULL DEFAULT '[]',
  sample_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. ANOMALIES TABLE (proxy detection results)
CREATE TABLE IF NOT EXISTS anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id_1 TEXT NOT NULL,
  student_id_2 TEXT NOT NULL,
  class_id TEXT NOT NULL,
  session_date DATE NOT NULL,
  correlation_score NUMERIC(4,3) NOT NULL,
  severity TEXT DEFAULT 'warning' CHECK (severity IN ('warning', 'critical')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed_proxy', 'false_positive', 'investigating')),
  reviewed_by UUID REFERENCES teachers(id),
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  rssi_data_1 JSONB,
  rssi_data_2 JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_class ON attendance(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(session_date);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_beacon ON sessions(beacon_major, beacon_minor);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_rssi_student_class ON rssi_streams(student_id, class_id, session_date);
CREATE INDEX IF NOT EXISTS idx_anomalies_status ON anomalies(status);
CREATE INDEX IF NOT EXISTS idx_anomalies_date ON anomalies(session_date);


-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE rssi_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;

-- Public read access for rooms (needed for beacon lookup)
CREATE POLICY "Rooms are viewable by everyone" ON rooms
  FOR SELECT USING (true);

-- Public read access for students (needed for check-in validation)
CREATE POLICY "Students are viewable by everyone" ON students
  FOR SELECT USING (true);

-- Teachers can view their own profile
CREATE POLICY "Teachers can view own profile" ON teachers
  FOR SELECT USING (auth.uid() = auth_id);

-- Teachers can view their own classes
CREATE POLICY "Teachers can view own classes" ON classes
  FOR SELECT USING (teacher_id IN (SELECT id FROM teachers WHERE auth_id = auth.uid()));

-- Teachers can manage their own sessions
CREATE POLICY "Teachers can manage own sessions" ON sessions
  FOR ALL USING (teacher_id IN (SELECT id FROM teachers WHERE auth_id = auth.uid()));

-- Public can view active sessions (needed for Flutter app)
CREATE POLICY "Active sessions are viewable" ON sessions
  FOR SELECT USING (status = 'active');

-- Attendance viewable by class teacher
CREATE POLICY "Teachers can view class attendance" ON attendance
  FOR SELECT USING (
    class_id IN (SELECT class_id FROM classes WHERE teacher_id IN (SELECT id FROM teachers WHERE auth_id = auth.uid()))
  );

-- Public can insert attendance (Flutter app check-in)
CREATE POLICY "Anyone can insert attendance" ON attendance
  FOR INSERT WITH CHECK (true);

-- Public can update attendance (for confirmation)
CREATE POLICY "Anyone can update attendance" ON attendance
  FOR UPDATE USING (true);

-- RSSI streams - public insert, teacher read
CREATE POLICY "Anyone can insert rssi streams" ON rssi_streams
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Teachers can view rssi streams" ON rssi_streams
  FOR SELECT USING (
    class_id IN (SELECT class_id FROM classes WHERE teacher_id IN (SELECT id FROM teachers WHERE auth_id = auth.uid()))
  );

-- Anomalies viewable by teachers
CREATE POLICY "Teachers can view anomalies" ON anomalies
  FOR SELECT USING (
    class_id IN (SELECT class_id FROM classes WHERE teacher_id IN (SELECT id FROM teachers WHERE auth_id = auth.uid()))
  );

CREATE POLICY "Teachers can update anomalies" ON anomalies
  FOR UPDATE USING (
    class_id IN (SELECT class_id FROM classes WHERE teacher_id IN (SELECT id FROM teachers WHERE auth_id = auth.uid()))
  );
