// Test Device Mismatch
const http = require('http');

console.log('🔒 Testing Device ID Locking...\n');

// Try to check in with DIFFERENT device ID
function testDeviceMismatch() {
  const postData = JSON.stringify({
    studentId: 'TEST001',  // Same student
    classId: 'CS102',      // Different class
    deviceId: 'DIFFERENT-DEVICE',  // ❌ DIFFERENT DEVICE
    rssi: -70
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
      console.log(`Status Code: ${res.statusCode}`);
      console.log('Response:', JSON.stringify(JSON.parse(data), null, 2));
      
      if (res.statusCode === 403) {
        console.log('\n✅ SUCCESS! Device mismatch detected!');
        console.log('🔒 Device ID locking is working perfectly!');
      } else {
        console.log('\n⚠️ Unexpected: Device mismatch not detected');
      }
    });
  });

  req.write(postData);
  req.end();
}

testDeviceMismatch();
