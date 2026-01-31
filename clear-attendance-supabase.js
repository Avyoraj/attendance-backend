/**
 * Clear Attendance Data (Supabase Version)
 * 
 * Run this script to clear attendance records for testing:
 * node clear-attendance-supabase.js
 * 
 * Options:
 * - node clear-attendance-supabase.js --all     : Clear ALL attendance records
 * - node clear-attendance-supabase.js --today   : Clear only today's records
 * - node clear-attendance-supabase.js --student STU001 : Clear specific student
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function clearAllAttendance() {
  console.log('🗑️  Clearing ALL attendance records...');

  const { data, error } = await supabase
    .from('attendance')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (workaround)

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  console.log('✅ All attendance records cleared!');
}

async function clearTodayAttendance() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`🗑️  Clearing attendance for today (${today})...`);

  const { data, error } = await supabase
    .from('attendance')
    .delete()
    .eq('session_date', today);

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  console.log(`✅ Today's attendance records cleared!`);
}

async function clearStudentAttendance(studentId) {
  console.log(`🗑️  Clearing attendance for student: ${studentId}...`);

  const { data, error } = await supabase
    .from('attendance')
    .delete()
    .eq('student_id', studentId);

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  console.log(`✅ Attendance cleared for student ${studentId}!`);
}

async function clearSessions() {
  console.log('🗑️  Clearing ALL sessions...');

  const { data, error } = await supabase
    .from('sessions')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  console.log('✅ All sessions cleared!');
}

async function showStats() {
  console.log('\n📊 Current Database Stats:');

  const { count: attendanceCount } = await supabase
    .from('attendance')
    .select('*', { count: 'exact', head: true });

  const { count: sessionCount } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true });

  const { count: studentCount } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true });

  console.log(`   - Attendance records: ${attendanceCount || 0}`);
  console.log(`   - Sessions: ${sessionCount || 0}`);
  console.log(`   - Students: ${studentCount || 0}`);
}

async function main() {
  const args = process.argv.slice(2);

  console.log('🧹 Attendance Data Cleaner (Supabase)\n');

  await showStats();
  console.log('');

  if (args.includes('--all')) {
    await clearAllAttendance();
    await clearSessions();
  } else if (args.includes('--today')) {
    await clearTodayAttendance();
  } else if (args.includes('--student') && args[args.indexOf('--student') + 1]) {
    await clearStudentAttendance(args[args.indexOf('--student') + 1]);
  } else if (args.includes('--sessions')) {
    await clearSessions();
  } else {
    console.log('Usage:');
    console.log('  node clear-attendance-supabase.js --all       Clear all attendance & sessions');
    console.log('  node clear-attendance-supabase.js --today     Clear today\'s attendance only');
    console.log('  node clear-attendance-supabase.js --student STU001  Clear specific student');
    console.log('  node clear-attendance-supabase.js --sessions  Clear all sessions only');
    console.log('');
    console.log('Run with --all to clear everything for fresh testing.');
  }

  await showStats();
}

main().catch(console.error);
