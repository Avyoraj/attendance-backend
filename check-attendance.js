require('dotenv').config();
const { supabaseAdmin } = require('./utils/supabase');

async function checkAttendance() {
  const today = new Date().toISOString().split('T')[0];
  
  console.log('=== TODAY\'S ATTENDANCE ===');
  const { data: attendance, error } = await supabaseAdmin
    .from('attendance')
    .select('*')
    .eq('session_date', today)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.log('Error:', error.message);
    return;
  }
  
  console.log(`Found ${attendance?.length || 0} attendance records for today (${today})\n`);
  
  attendance?.forEach(a => {
    console.log(`Student: ${a.student_id}`);
    console.log(`  Class: ${a.class_id}`);
    console.log(`  Status: ${a.status}`);
    console.log(`  Check-in: ${a.check_in_time}`);
    console.log(`  Confirmed: ${a.confirmed_at || 'N/A'}`);
    console.log(`  Cancelled: ${a.cancelled_at || 'N/A'}`);
    console.log(`  Cancel Reason: ${a.cancellation_reason || 'N/A'}`);
    console.log(`  RSSI: ${a.rssi}`);
    console.log(`  Device: ${a.device_id?.substring(0, 20)}...`);
    console.log('');
  });

  // Also check recent attendance (last 24 hours)
  console.log('\n=== RECENT ATTENDANCE (Last 24h) ===');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const { data: recent } = await supabaseAdmin
    .from('attendance')
    .select('*')
    .gte('created_at', yesterday.toISOString())
    .order('created_at', { ascending: false })
    .limit(10);
  
  recent?.forEach(a => {
    const checkIn = new Date(a.check_in_time).toLocaleString();
    const status = a.status.toUpperCase();
    const statusIcon = a.status === 'confirmed' ? '✅' : a.status === 'cancelled' ? '❌' : '⏳';
    console.log(`${statusIcon} ${a.student_id} | ${a.class_id} | ${status} | ${checkIn}`);
    if (a.cancellation_reason) {
      console.log(`   Reason: ${a.cancellation_reason}`);
    }
  });
}

checkAttendance().catch(console.error);
