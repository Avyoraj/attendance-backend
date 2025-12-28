require('dotenv').config();
const { supabaseAdmin } = require('./utils/supabase');
const correlationService = require('./services/correlation.service');

async function checkData() {
  console.log('=== RSSI STREAMS (Last 10) ===');
  const { data: streams, error: streamErr } = await supabaseAdmin
    .from('rssi_streams')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (streamErr) {
    console.log('Error:', streamErr.message);
  } else {
    console.log('Total streams found:', streams?.length || 0);
    streams?.forEach(s => {
      const dataCount = s.rssi_data?.length || 0;
      console.log(`\n  Student: ${s.student_id}`);
      console.log(`  Class: ${s.class_id}, Date: ${s.session_date}`);
      console.log(`  Samples: ${dataCount}`);
      if (dataCount > 0) {
        const first = s.rssi_data[0];
        const last = s.rssi_data[dataCount - 1];
        console.log(`  First timestamp: ${first.timestamp || first.t}`);
        console.log(`  Last timestamp: ${last.timestamp || last.t}`);
        
        // Calculate RSSI stats
        const rssiValues = s.rssi_data.map(d => d.rssi || d.r);
        const min = Math.min(...rssiValues);
        const max = Math.max(...rssiValues);
        const avg = rssiValues.reduce((a, b) => a + b, 0) / rssiValues.length;
        const stdDev = Math.sqrt(rssiValues.map(v => Math.pow(v - avg, 2)).reduce((a, b) => a + b, 0) / rssiValues.length);
        
        console.log(`  RSSI: min=${min}, max=${max}, avg=${avg.toFixed(1)}, stdDev=${stdDev.toFixed(2)}`);
      }
    });
  }

  console.log('\n\n=== ANOMALIES (Last 10) ===');
  const { data: anomalies, error: anomErr } = await supabaseAdmin
    .from('anomalies')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (anomErr) {
    console.log('Error:', anomErr.message);
  } else {
    console.log('Total anomalies found:', anomalies?.length || 0);
    anomalies?.forEach(a => {
      console.log(`\n  Pair: ${a.student_id_1} & ${a.student_id_2}`);
      console.log(`  Correlation: ρ = ${a.correlation_score?.toFixed(4)}`);
      console.log(`  Status: ${a.status}, Severity: ${a.severity}`);
      console.log(`  Date: ${a.session_date}`);
      console.log(`  Notes: ${a.notes}`);
    });
  }

  // Check today's streams specifically
  const today = new Date().toISOString().split('T')[0];
  console.log(`\n\n=== TODAY'S STREAMS (${today}) ===`);
  const { data: todayStreams } = await supabaseAdmin
    .from('rssi_streams')
    .select('*')
    .eq('session_date', today);
  
  console.log(`Found ${todayStreams?.length || 0} streams for today`);
  
  if (todayStreams?.length >= 2) {
    console.log('\n=== DETAILED CORRELATION ANALYSIS ===');
    
    // Format streams for correlation service
    const formattedStreams = todayStreams.map(s => ({
      studentId: s.student_id,
      classId: s.class_id,
      rssiData: (s.rssi_data || []).map(d => ({
        timestamp: d.timestamp || d.t,
        rssi: d.rssi || d.r
      }))
    }));
    
    // Run correlation
    const stream1 = formattedStreams[0];
    const stream2 = formattedStreams[1];
    
    console.log(`\nComparing ${stream1.studentId} vs ${stream2.studentId}:`);
    console.log(`  Stream 1: ${stream1.rssiData.length} samples`);
    console.log(`  Stream 2: ${stream2.rssiData.length} samples`);
    
    const result = correlationService.computePearsonCorrelation(stream1.rssiData, stream2.rssiData);
    
    console.log(`\n  Alignment method: ${result.alignmentMethod}`);
    console.log(`  Aligned data points: ${result.dataPoints}`);
    console.log(`  Correlation: ρ = ${result.correlation?.toFixed(4)}`);
    console.log(`  Mean RSSI: ${result.mean1} vs ${result.mean2}`);
    console.log(`  StdDev: ${result.stdDev1} vs ${result.stdDev2}`);
    
    if (result.stationaryCheck) {
      console.log(`\n  Stationary check:`);
      console.log(`    Is stationary: ${result.stationaryCheck.isStationary}`);
      console.log(`    Same location: ${result.stationaryCheck.isSameLocation}`);
      console.log(`    Suspicious stationary: ${result.stationaryCheck.isSuspiciousStationary}`);
    }
    
    // Show first 10 aligned values
    console.log(`\n  First 10 aligned RSSI values:`);
    for (let i = 0; i < Math.min(10, result.aligned1?.length || 0); i++) {
      console.log(`    [${i}] ${result.aligned1[i]} vs ${result.aligned2[i]} (diff: ${Math.abs(result.aligned1[i] - result.aligned2[i])})`);
    }
  }
}

checkData().catch(console.error);
