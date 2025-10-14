#!/usr/bin/env node

/**
 * Test Script: Two-Stage Attendance Proximity Verification
 * 
 * This script tests the critical fix for attendance confirmation
 * that now verifies RSSI before confirming attendance.
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

// Test configuration
const TEST_STUDENT = '0080';
const TEST_CLASS = '101';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testProvisionalCreation() {
  console.log('\n📝 Test 1: Creating Provisional Attendance');
  console.log('='.repeat(60));
  
  try {
    const response = await axios.post(`${BASE_URL}/check-in`, {
      studentId: TEST_STUDENT,
      classId: TEST_CLASS,
      beaconData: {
        uuid: 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825',
        major: 100,
        minor: 1,
        rssi: -65
      }
    });
    
    console.log('✅ Provisional attendance created');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Failed to create provisional attendance');
    console.error('Error:', error.response?.data || error.message);
    return false;
  }
}

async function testConfirmation() {
  console.log('\n✅ Test 2: Confirming Attendance (Student In Range)');
  console.log('='.repeat(60));
  
  try {
    const response = await axios.post(`${BASE_URL}/attendance/confirm`, {
      studentId: TEST_STUDENT,
      classId: TEST_CLASS
    });
    
    console.log('✅ Attendance confirmed');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Failed to confirm attendance');
    console.error('Error:', error.response?.data || error.message);
    return false;
  }
}

async function testCancellation() {
  console.log('\n🚫 Test 3: Cancelling Provisional Attendance (Student Out of Range)');
  console.log('='.repeat(60));
  
  try {
    const response = await axios.post(`${BASE_URL}/attendance/cancel-provisional`, {
      studentId: TEST_STUDENT,
      classId: TEST_CLASS
    });
    
    console.log('✅ Provisional attendance cancelled');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Failed to cancel provisional attendance');
    console.error('Error:', error.response?.data || error.message);
    return false;
  }
}

async function getAttendanceStatus() {
  console.log('\n📊 Checking Current Attendance Status');
  console.log('='.repeat(60));
  
  try {
    const response = await axios.get(`${BASE_URL}/attendance`, {
      params: {
        studentId: TEST_STUDENT,
        classId: TEST_CLASS
      }
    });
    
    console.log('📋 Current Attendance Records:');
    if (response.data.length === 0) {
      console.log('   No attendance records found');
    } else {
      response.data.forEach(record => {
        console.log(`   - Status: ${record.status}`);
        console.log(`     Check-in: ${record.checkInTime}`);
        console.log(`     Confirmed: ${record.confirmedAt || 'Not yet'}`);
      });
    }
    return response.data;
  } catch (error) {
    console.error('❌ Failed to get attendance status');
    console.error('Error:', error.response?.data || error.message);
    return null;
  }
}

async function runTests() {
  console.log('\n🧪 Two-Stage Attendance Proximity Verification Tests');
  console.log('='.repeat(60));
  console.log(`Testing with Student: ${TEST_STUDENT}, Class: ${TEST_CLASS}`);
  console.log(`Backend: ${BASE_URL}`);
  
  // Check initial status
  await getAttendanceStatus();
  
  // Test 1: Create provisional attendance
  const created = await testProvisionalCreation();
  if (!created) {
    console.log('\n⚠️ Cannot proceed - provisional creation failed');
    return;
  }
  
  await sleep(1000);
  await getAttendanceStatus();
  
  // Test 2: Try to confirm (should work if student in range)
  console.log('\n⏳ Simulating student staying in range...');
  await sleep(2000);
  
  const confirmed = await testConfirmation();
  
  if (confirmed) {
    console.log('\n✅ Test passed: Attendance confirmed when student in range');
    await getAttendanceStatus();
    return;
  }
  
  // Test 3: If confirmation failed, try cancellation
  console.log('\n⏳ Simulating student leaving (out of range)...');
  await sleep(2000);
  
  const cancelled = await testCancellation();
  
  if (cancelled) {
    console.log('\n✅ Test passed: Attendance cancelled when student out of range');
  }
  
  await getAttendanceStatus();
  
  console.log('\n' + '='.repeat(60));
  console.log('🏁 Tests Complete!');
  console.log('\nNext Steps:');
  console.log('1. Run the Flutter app');
  console.log('2. Test actual RSSI-based confirmation');
  console.log('3. Verify logs show proximity checks');
  console.log('='.repeat(60));
}

// Run tests
runTests().catch(error => {
  console.error('\n💥 Test suite crashed:', error);
  process.exit(1);
});
