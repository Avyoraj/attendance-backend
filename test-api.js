// Quick API Test Script
const http = require('http');

console.log('🧪 Testing Attendance Backend API...\n');

// Test 1: Health Check
function testHealth() {
  return new Promise((resolve) => {
    console.log('1️⃣ Testing Health Endpoint...');
    http.get('http://localhost:3000/api/health', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('✅ Health Check:', data);
        console.log('');
        resolve();
      });
    });
  });
}

// Test 2: Check-in
function testCheckIn() {
  return new Promise((resolve) => {
    console.log('2️⃣ Testing Check-in Endpoint...');
    
    const postData = JSON.stringify({
      studentId: 'TEST001',
      classId: 'CS101',
      deviceId: 'test-device-123',
      rssi: -65,
      distance: 2.5
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/check-in',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('✅ Check-in Response:');
        console.log(JSON.stringify(JSON.parse(data), null, 2));
        console.log('');
        resolve();
      });
    });

    req.write(postData);
    req.end();
  });
}

// Test 3: Get Attendance
function testGetAttendance() {
  return new Promise((resolve) => {
    console.log('3️⃣ Testing Get Attendance Endpoint...');
    http.get('http://localhost:3000/api/attendance', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const result = JSON.parse(data);
        console.log('✅ Attendance Records:');
        console.log(`   Count: ${result.count}`);
        if (result.count > 0) {
          console.log(`   First Record:`, result.attendance[0]);
        }
        console.log('');
        resolve();
      });
    });
  });
}

// Test 4: Confirm Attendance
function testConfirm() {
  return new Promise((resolve) => {
    console.log('4️⃣ Testing Confirmation Endpoint...');
    
    const postData = JSON.stringify({
      studentId: 'TEST001',
      classId: 'CS101'
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/attendance/confirm',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('✅ Confirmation Response:');
        console.log(JSON.stringify(JSON.parse(data), null, 2));
        console.log('');
        resolve();
      });
    });

    req.write(postData);
    req.end();
  });
}

// Run all tests
async function runTests() {
  try {
    await testHealth();
    await testCheckIn();
    await testGetAttendance();
    await testConfirm();
    
    console.log('🎉 All tests completed!');
    console.log('📊 Check your dashboard at: http://localhost:3000');
    console.log('');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

runTests();
