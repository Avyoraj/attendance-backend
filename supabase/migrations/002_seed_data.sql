-- =============================================
-- SEED DATA FOR TESTING
-- =============================================

-- Insert test room with your ESP32 beacon config (Major: 1, Minor: 101)
INSERT INTO rooms (room_id, name, building, floor, beacon_major, beacon_minor) VALUES
  ('R101', 'Room 101', 'Main Building', '1st Floor', 1, 101),
  ('R102', 'Room 102', 'Main Building', '1st Floor', 1, 102),
  ('R201', 'Room 201', 'Main Building', '2nd Floor', 1, 201)
ON CONFLICT (room_id) DO NOTHING;

-- Insert test students
INSERT INTO students (student_id, name, email, year, section) VALUES
  ('STU001', 'Alice Johnson', 'alice@test.com', 3, 'A'),
  ('STU002', 'Bob Smith', 'bob@test.com', 3, 'A'),
  ('STU003', 'Charlie Brown', 'charlie@test.com', 3, 'B'),
  ('STU004', 'Diana Prince', 'diana@test.com', 3, 'B'),
  ('STU005', 'Eve Wilson', 'eve@test.com', 3, 'A')
ON CONFLICT (student_id) DO NOTHING;

-- Note: Teacher and classes will be created after teacher registers via Supabase Auth
-- The teacher registration flow will:
-- 1. Create auth.users entry via Supabase Auth
-- 2. Create teachers table entry with auth_id reference
-- 3. Create classes assigned to that teacher

-- Sample classes (teacher_id will be updated after teacher registration)
INSERT INTO classes (class_id, name, subject) VALUES
  ('CS101', 'Introduction to Programming', 'Computer Science'),
  ('CS201', 'Data Structures', 'Computer Science'),
  ('CS301', 'Database Systems', 'Computer Science'),
  ('MATH101', 'Calculus I', 'Mathematics'),
  ('PHY101', 'Physics I', 'Physics')
ON CONFLICT (class_id) DO NOTHING;
