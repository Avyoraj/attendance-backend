/**
 * Test Concurrent Check-ins
 * 
 * This script tests if two students can check-in simultaneously
 * without race conditions or data loss.
 * 
 * Run: node test-concurrent-checkin.js
 */

require('dotenv').config();
const { supabaseAdmin } = require('./utils/supabase');
const crypto = require('crypto');

// Configuration
const TEST_CLASS_ID = 'CS101';
const STUDENT_A = '0017';
const STUDENT_B = '0080';
const API_BASE = process.env.API_URL || 'http://localhost:3000/api';

// Device ID simulation (different devices)
const DEVICE_A = '885848d8051897fc74c09815cd84b223dc0cf2fb89889c24875ddd8b2e210159';
const DEVICE_B = 'ae62f272d2ba96517ff3d0e0a9e846dc1e392fbdd80572142504be1b18a9799c';

// HMAC signature generation (same as Flutter app)
function generateDeviceSignature(deviceId) {
  const salt = '64650144b7d4b235198e6b1ca6d3352a921022d311f14e06d45dc4667314155a';
  return crypto.createHmac('sha256', salt).update(deviceId).digest('hex');
}

// Generate unique event ID
function generateEventId() {
  return `evt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

// Check-in function
async function checkIn(studentId, deviceId) {
  const eventId = generateEventId();
  const deviceSignature = generateDeviceSignature(deviceId);
  
  const body = {
    studentId,
    classId: TEST_CLASS_ID,
    deviceId,
    deviceIdHash: deviceId,
    rssi: -55,
    eventId,
    deviceSignature,
    deviceSaltVersion: 'v1',
  };

  const response = await fetch(`${API_BASE}/attendance/check-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return { status: response.status, data, studentId };
}

// Main test
async function runTest() {
  console.log('=== CONCURRENT CHECK-IN TEST ===\n');
  
  // Step 1: Clear today's attendance for test students
  const today = new Date().toISOString().split('T')[0];
  console.log(`📅 Testing for date: ${today}`);
  console.log(`🧹 Clearing previous test data...`);
  
  const { error: clearError } = await supabaseAdmin
    .from('attendance')
    .delete()
    .in('student_id', [STUDENT_A, STUDENT_B])
    .eq('session_date', today);
  
  if (clearError) {
    console.error('❌ Failed to clear test data:', clearError);
    return;
  }
  
  // Also clear RSSI streams and idempotency keys for clean test
  await supabaseAdmin
    .from('rssi_streams')
    .delete()
    .in('student_id', [STUDENT_A, STUDENT_B])
    .eq('session_date', today);
  
  await supabaseAdmin
    .from('idempotency_keys')
    .delete()
    .ilike('scope', `%${STUDENT_A}%${today}%`);
  
  await supabaseAdmin
    .from('idempotency_keys')
    .delete()
    .ilike('scope', `%${STUDENT_B}%${today}%`);
  
  console.log('✅ Test data cleared\n');

  // Step 2: Concurrent check-ins
  console.log('🚀 Initiating concurrent check-ins...');
  console.log(`   Student A: ${STUDENT_A} (Device: ${DEVICE_A.substring(0, 12)}...)`);
  console.log(`   Student B: ${STUDENT_B} (Device: ${DEVICE_B.substring(0, 12)}...)`);
  
  const startTime = Date.now();
  
  // Fire both check-ins simultaneously
  const [resultA, resultB] = await Promise.all([
    checkIn(STUDENT_A, DEVICE_A),
    checkIn(STUDENT_B, DEVICE_B),
  ]);
  
  const duration = Date.now() - startTime;
  console.log(`\n⏱️ Both requests completed in ${duration}ms\n`);
  
  // Step 3: Analyze results
  console.log('=== RESULTS ===\n');
  
  console.log(`Student A (${STUDENT_A}):`);
  console.log(`  Status: ${resultA.status}`);
  console.log(`  Success: ${resultA.data.success}`);
  console.log(`  Message: ${resultA.data.message}`);
  if (resultA.data.attendance) {
    console.log(`  Attendance ID: ${resultA.data.attendance.id}`);
    console.log(`  Check-in Time: ${resultA.data.attendance.checkInTime}`);
  }
  if (resultA.data.error) {
    console.log(`  ❌ Error: ${resultA.data.error}`);
  }
  
  console.log(`\nStudent B (${STUDENT_B}):`);
  console.log(`  Status: ${resultB.status}`);
  console.log(`  Success: ${resultB.data.success}`);
  console.log(`  Message: ${resultB.data.message}`);
  if (resultB.data.attendance) {
    console.log(`  Attendance ID: ${resultB.data.attendance.id}`);
    console.log(`  Check-in Time: ${resultB.data.attendance.checkInTime}`);
  }
  if (resultB.data.error) {
    console.log(`  ❌ Error: ${resultB.data.error}`);
  }
  
  // Step 4: Verify database state
  console.log('\n=== DATABASE VERIFICATION ===\n');
  
  const { data: attendance, error: fetchError } = await supabaseAdmin
    .from('attendance')
    .select('*')
    .in('student_id', [STUDENT_A, STUDENT_B])
    .eq('session_date', today);
  
  if (fetchError) {
    console.error('❌ Failed to fetch attendance:', fetchError);
    return;
  }
  
  console.log(`📊 Found ${attendance.length} attendance records:\n`);
  
  for (const record of attendance) {
    console.log(`  ${record.student_id}:`);
    console.log(`    ID: ${record.id}`);
    console.log(`    Status: ${record.status}`);
    console.log(`    Check-in: ${record.check_in_time}`);
    console.log(`    Device: ${record.device_id?.substring(0, 12)}...`);
    console.log('');
  }
  
  // Final verdict
  console.log('=== VERDICT ===\n');
  
  const studentAFound = attendance.some(r => r.student_id === STUDENT_A);
  const studentBFound = attendance.some(r => r.student_id === STUDENT_B);
  
  if (studentAFound && studentBFound) {
    console.log('✅ SUCCESS: Both students have attendance records!');
    console.log('   Concurrent check-in is working correctly.');
  } else {
    console.log('❌ FAILURE: Missing attendance records!');
    if (!studentAFound) console.log(`   - Student A (${STUDENT_A}) is MISSING`);
    if (!studentBFound) console.log(`   - Student B (${STUDENT_B}) is MISSING`);
    console.log('\n   This indicates a concurrency bug!');
  }
}

// Run the test
runTest().catch(console.error);
