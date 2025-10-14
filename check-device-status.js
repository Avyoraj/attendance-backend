const mongoose = require('mongoose');
require('dotenv').config();

const Student = require('./models/Student');

async function checkDeviceBindings() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');

    // Find all students with device bindings
    const studentsWithDevices = await Student.find({ 
      deviceId: { $ne: null } 
    }).select('studentId deviceId deviceRegisteredAt');

    console.log(`📊 Students with Device Bindings: ${studentsWithDevices.length}\n`);

    if (studentsWithDevices.length === 0) {
      console.log('✅ No device bindings found - database is clean\n');
    } else {
      console.log('Current Device Bindings:');
      console.log('========================\n');
      
      studentsWithDevices.forEach((student, index) => {
        console.log(`${index + 1}. Student ID: ${student.studentId}`);
        console.log(`   Device: ${student.deviceId}`);
        console.log(`   Registered: ${student.deviceRegisteredAt || 'N/A'}`);
        console.log('');
      });

      // Check for duplicates
      const deviceIds = studentsWithDevices.map(s => s.deviceId);
      const duplicates = deviceIds.filter((id, index) => deviceIds.indexOf(id) !== index);
      
      if (duplicates.length > 0) {
        console.log('⚠️  WARNING: Duplicate device IDs detected!');
        console.log(`   Duplicates: ${[...new Set(duplicates)].join(', ')}\n`);
      } else {
        console.log('✅ No duplicate device IDs found\n');
      }
    }

    // Check indexes
    console.log('🔍 Checking Database Indexes...');
    const indexes = await Student.collection.getIndexes();
    
    const hasDeviceIndex = Object.keys(indexes).some(key => 
      key.includes('deviceId')
    );

    if (hasDeviceIndex) {
      console.log('✅ Device uniqueness index exists');
      console.log('\nIndex Details:');
      Object.entries(indexes).forEach(([name, index]) => {
        if (name.includes('deviceId')) {
          console.log(`   ${name}:`, JSON.stringify(index, null, 2));
        }
      });
    } else {
      console.log('⚠️  WARNING: No device uniqueness index found!');
      console.log('   Run server.js to create the index automatically');
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkDeviceBindings();
