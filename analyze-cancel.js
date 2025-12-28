require('dotenv').config();
const { supabaseAdmin } = require('./utils/supabase');

async function analyzeCancel() {
  const today = new Date().toISOString().split('T')[0];
  
  // Get the cancelled attendance
  const { data: attendance } = await supabaseAdmin
    .from('attendance')
    .select('*')
    .eq('session_date', today)
    .eq('student_id', '0080')
    .single();
  
  if (!attendance) {
    console.log('No attendance found');
    return;
  }
  
  console.log('=== ATTENDANCE TIMELINE ===');
  const checkIn = new Date(attendance.check_in_time);
  const cancelled = attendance.cancelled_at ? new Date(attendance.cancelled_at) : null;
  
  console.log(`Check-in time:  ${checkIn.toISOString()}`);
  console.log(`Cancelled time: ${cancelled?.toISOString() || 'N/A'}`);
  
  if (cancelled) {
    const duration = (cancelled - checkIn) / 1000;
    console.log(`Duration: ${Math.floor(duration / 60)}m ${Math.floor(duration % 60)}s`);
    console.log(`\nExpected confirmation at: ${new Date(checkIn.getTime() + 3 * 60 * 1000).toISOString()} (3 min after check-in)`);
  }
  
  // Get RSSI stream
  const { data: stream } = await supabaseAdmin
    .from('rssi_streams')
    .select('*')
    .eq('session_date', today)
    .eq('student_id', '0080')
    .single();
  
  if (stream) {
    console.log('\n=== RSSI STREAM ANALYSIS ===');
    console.log(`Total samples: ${stream.sample_count || stream.rssi_data?.length}`);
    
    const rssiData = stream.rssi_data || [];
    if (rssiData.length > 0) {
      const firstTs = new Date(rssiData[0].timestamp || rssiData[0].t);
      const lastTs = new Date(rssiData[rssiData.length - 1].timestamp || rssiData[rssiData.length - 1].t);
      
      console.log(`First RSSI: ${firstTs.toISOString()}`);
      console.log(`Last RSSI:  ${lastTs.toISOString()}`);
      console.log(`Stream duration: ${Math.floor((lastTs - firstTs) / 1000)}s`);
      
      // Check if RSSI was being received around cancellation time
      if (cancelled) {
        const cancelTime = cancelled.getTime();
        const rssiAroundCancel = rssiData.filter(d => {
          const ts = new Date(d.timestamp || d.t).getTime();
          return Math.abs(ts - cancelTime) < 30000; // Within 30 seconds
        });
        
        console.log(`\nRSSI readings around cancellation time (±30s): ${rssiAroundCancel.length}`);
        rssiAroundCancel.forEach(d => {
          const ts = new Date(d.timestamp || d.t);
          const rssi = d.rssi || d.r;
          const diff = (ts.getTime() - cancelTime) / 1000;
          console.log(`  ${diff > 0 ? '+' : ''}${diff.toFixed(0)}s: RSSI = ${rssi} dBm`);
        });
      }
      
      // Show last 10 RSSI readings
      console.log('\n=== LAST 10 RSSI READINGS ===');
      const last10 = rssiData.slice(-10);
      last10.forEach((d, i) => {
        const ts = new Date(d.timestamp || d.t);
        const rssi = d.rssi || d.r;
        console.log(`  [${i}] ${ts.toISOString()} | RSSI: ${rssi} dBm`);
      });
    }
  } else {
    console.log('\n⚠️ No RSSI stream found for this student today');
  }
  
  console.log('\n=== DIAGNOSIS ===');
  if (cancelled) {
    const duration = (cancelled - checkIn) / 1000;
    if (duration < 180) {
      console.log(`❌ Cancelled BEFORE 3-minute confirmation window (at ${Math.floor(duration)}s)`);
      console.log('   This means the app detected the student left the classroom early.');
      console.log('   Possible causes:');
      console.log('   1. Phone went to sleep and stopped BLE scanning');
      console.log('   2. Bluetooth was disabled');
      console.log('   3. App was killed or backgrounded');
      console.log('   4. Beacon signal was lost (too weak or interference)');
    } else {
      console.log(`⏱️ Cancelled AFTER 3-minute window (at ${Math.floor(duration)}s)`);
      console.log('   The confirmation check failed - RSSI was too weak or stale.');
    }
  }
}

analyzeCancel().catch(console.error);
