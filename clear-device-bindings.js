/**
 * Clear Device Bindings Script
 * 
 * This script clears all device bindings from the Student collection
 * while keeping attendance records intact.
 * 
 * Use this when:
 * - Testing device uniqueness features
 * - Migrating from old device ID system to new persistent UUID system
 * - Resetting device locks for all students
 * 
 * Usage: node clear-device-bindings.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Student = require('./models/Student');

async function clearDeviceBindings() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Get count before clearing
    const totalStudents = await Student.countDocuments();
    const studentsWithDevices = await Student.countDocuments({ deviceId: { $exists: true, $ne: null } });
    
    console.log('\n📊 Current State:');
    console.log(`   Total Students: ${totalStudents}`);
    console.log(`   Students with Device Binding: ${studentsWithDevices}`);
    
    if (studentsWithDevices === 0) {
      console.log('\n✅ No device bindings to clear!');
      process.exit(0);
    }
    
    // Show which students have device bindings
    const studentsWithBindings = await Student.find({ 
      deviceId: { $exists: true, $ne: null } 
    }).select('studentId deviceId deviceRegisteredAt');
    
    console.log('\n🔒 Students with Device Bindings:');
    studentsWithBindings.forEach(student => {
      console.log(`   Student ${student.studentId}: ${student.deviceId}`);
      if (student.deviceRegisteredAt) {
        console.log(`      Registered: ${student.deviceRegisteredAt.toLocaleString()}`);
      }
    });
    
    // Clear device bindings
    console.log('\n⚠️  Clearing all device bindings...');
    const result = await Student.updateMany(
      { deviceId: { $exists: true, $ne: null } },
      { 
        $unset: { 
          deviceId: "",
          deviceRegisteredAt: "" 
        } 
      }
    );
    
    console.log(`✅ Cleared ${result.modifiedCount} device bindings`);
    
    // Verify
    const remainingBindings = await Student.countDocuments({ 
      deviceId: { $exists: true, $ne: null } 
    });
    
    console.log('\n📊 Final State:');
    console.log(`   Total Students: ${totalStudents}`);
    console.log(`   Students with Device Binding: ${remainingBindings}`);
    
    if (remainingBindings === 0) {
      console.log('\n🎉 All device bindings cleared successfully!');
      console.log('📱 Students can now login with their new persistent device IDs');
    } else {
      console.log('\n⚠️  Warning: Some device bindings remain');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the script
clearDeviceBindings();
