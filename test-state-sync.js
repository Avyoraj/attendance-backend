// Test script for State Management API endpoint
// Run with: node test-state-sync.js

const API_BASE = 'https://attendance-backend-omega.vercel.app/api';
const TEST_STUDENT_ID = '0080'; // Change to your test student ID

async function testGetTodayAttendance() {
  console.log('🧪 Testing GET /api/attendance/today/:studentId endpoint...\n');
  
  try {
    const response = await fetch(`${API_BASE}/attendance/today/${TEST_STUDENT_ID}`);
    const data = await response.json();
    
    console.log('📊 Response Status:', response.status);
    console.log('📦 Response Data:', JSON.stringify(data, null, 2));
    
    // Check if API call was successful (status 200 OR data has expected structure)
    if (response.status === 200 || (data && 'studentId' in data && 'attendance' in data)) {
      console.log('\n✅ API ENDPOINT WORKING!');
      console.log(`   Student ID: ${data.studentId}`);
      console.log(`   Date: ${data.date}`);
      console.log(`   Total Records: ${data.count}`);
      
      if (data.attendance && data.attendance.length > 0) {
        console.log('\n📋 Attendance Records:');
        data.attendance.forEach((record, index) => {
          console.log(`\n   Record ${index + 1}:`);
          console.log(`   - Class ID: ${record.classId}`);
          console.log(`   - Status: ${record.status}`);
          console.log(`   - Check-in Time: ${record.checkInTime}`);
          
          if (record.status === 'confirmed') {
            console.log(`   - Confirmed At: ${record.confirmedAt}`);
          } else if (record.status === 'provisional') {
            console.log(`   - Elapsed Seconds: ${record.elapsedSeconds}`);
            console.log(`   - Remaining Seconds: ${record.remainingSeconds}`);
            console.log(`   - Should Confirm: ${record.shouldConfirm}`);
          }
        });
      } else {
        console.log('\n📭 No attendance records for today (this is normal if you haven\'t checked in yet)');
        console.log('   💡 To test with data: Check in using the Flutter app, then run this script again');
      }
    } else {
      console.log('\n❌ API REQUEST FAILED!');
      console.log('   Error:', data.error || 'Unknown error');
      console.log('   Message:', data.message || 'No error message');
    }
  } catch (error) {
    console.error('\n💥 ERROR:', error.message);
  }
}

// Run the test
testGetTodayAttendance();
