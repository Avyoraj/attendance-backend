// Test script to register a teacher and create a class
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testBackend() {
  console.log('🧪 Testing Unified Backend...\n');

  try {
    // 1. Register a teacher
    console.log('1️⃣ Registering a teacher...');
    const registerResponse = await axios.post(`${BASE_URL}/api/teachers/register`, {
      name: 'Test Teacher',
      email: 'test.teacher@school.com',
      password: 'password123',
      department: 'Computer Science'
    });

    console.log('✅ Teacher registered successfully!');
    console.log('   Name:', registerResponse.data.data.teacher.name);
    console.log('   Email:', registerResponse.data.data.teacher.email);
    console.log('   Token:', registerResponse.data.data.token.substring(0, 20) + '...');

    const token = registerResponse.data.data.token;

    // 2. Get teacher profile
    console.log('\n2️⃣ Getting teacher profile...');
    const profileResponse = await axios.get(`${BASE_URL}/api/teachers/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('✅ Profile fetched successfully!');
    console.log('   Name:', profileResponse.data.data.teacher.name);
    console.log('   Department:', profileResponse.data.data.teacher.department);

    // 3. Create a class
    console.log('\n3️⃣ Creating a class...');
    const classResponse = await axios.post(`${BASE_URL}/api/classes`, {
      classId: 'CS101',
      name: 'Introduction to Computer Science',
      subject: 'Computer Science',
      room: 'Room 203',
      semester: 'Fall 2025',
      schedule: {
        monday: [{ start: '10:00', end: '11:30' }],
        wednesday: [{ start: '10:00', end: '11:30' }],
        friday: [{ start: '10:00', end: '11:30' }]
      },
      beaconConfig: {
        uuid: 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825',
        major: 101,
        minor: 203,
        rssiThreshold: -75
      }
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('✅ Class created successfully!');
    console.log('   Class ID:', classResponse.data.data.class.classId);
    console.log('   Name:', classResponse.data.data.class.name);
    console.log('   Room:', classResponse.data.data.class.room);
    console.log('   Beacon Major:', classResponse.data.data.class.beaconConfig.major);

    // 4. Get all classes
    console.log('\n4️⃣ Getting all classes...');
    const classesResponse = await axios.get(`${BASE_URL}/api/classes`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('✅ Classes fetched successfully!');
    console.log('   Total classes:', classesResponse.data.data?.count || classesResponse.data.data?.classes?.length || 0);

    console.log('\n🎉 All tests passed! Backend is working perfectly!\n');
    console.log('📝 Summary:');
    console.log('   - Teacher authentication: ✅');
    console.log('   - Class creation: ✅');
    console.log('   - API endpoints: ✅');
    console.log('\n✨ You can now start the React app and login with:');
    console.log('   Email: test.teacher@school.com');
    console.log('   Password: password123');

  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 409) {
      console.log('\n💡 Teacher already exists! You can login with:');
      console.log('   Email: test.teacher@school.com');
      console.log('   Password: password123');
    }
  }
}

// Run tests
testBackend();
