/**
 * Seed Demo Data Script
 * 
 * Creates initial rooms, a test teacher, and test classes for development.
 * Run with: node scripts/seed-demo-data.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Room = require('../models/Room');
const Teacher = require('../models/Teacher');
const Class = require('../models/Class');
const Student = require('../models/Student');

const MONGO_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

async function seedData() {
  try {
    console.log('🌱 Starting seed process...\n');
    
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // 1. Create Rooms
    console.log('📍 Creating rooms...');
    const rooms = [
      {
        roomId: 'R101',
        name: 'Room 101 - Computer Lab',
        building: 'Main Building',
        floor: '1',
        capacity: 40,
        beaconConfig: { major: 1, minor: 101 }
      },
      {
        roomId: 'R102',
        name: 'Room 102 - Lecture Hall',
        building: 'Main Building',
        floor: '1',
        capacity: 60,
        beaconConfig: { major: 1, minor: 102 }
      },
      {
        roomId: 'R201',
        name: 'Room 201 - Seminar Room',
        building: 'Main Building',
        floor: '2',
        capacity: 30,
        beaconConfig: { major: 1, minor: 201 }
      }
    ];

    for (const room of rooms) {
      const existing = await Room.findOne({ roomId: room.roomId });
      if (!existing) {
        await Room.create(room);
        console.log(`  ✅ Created room: ${room.name}`);
      } else {
        console.log(`  ⏭️  Room exists: ${room.name}`);
      }
    }

    // 2. Create Test Teacher
    console.log('\n👨‍🏫 Creating test teacher...');
    const teacherEmail = 'teacher@test.com';
    let teacher = await Teacher.findOne({ email: teacherEmail });
    
    if (!teacher) {
      const passwordHash = await bcrypt.hash('password123', 12);
      teacher = await Teacher.create({
        name: 'Test Teacher',
        email: teacherEmail,
        password_hash: passwordHash,
        department: 'Computer Science',
        isVerified: true,
        isActive: true
      });
      console.log(`  ✅ Created teacher: ${teacher.name} (${teacher.email})`);
      console.log(`  📝 Login: ${teacherEmail} / password123`);
    } else {
      console.log(`  ⏭️  Teacher exists: ${teacher.email}`);
    }

    // 3. Create Test Classes
    console.log('\n📚 Creating test classes...');
    const classes = [
      {
        classId: 'CS101',
        name: 'Introduction to Programming',
        subject: 'Computer Science',
        teacherId: teacher._id,
        room: 'R101',
        beaconConfig: { major: 1, minor: 101, rssiThreshold: -75 }
      },
      {
        classId: 'CS201',
        name: 'Data Structures',
        subject: 'Computer Science',
        teacherId: teacher._id,
        room: 'R102',
        beaconConfig: { major: 1, minor: 102, rssiThreshold: -75 }
      },
      {
        classId: 'CS301',
        name: 'Database Systems',
        subject: 'Computer Science',
        teacherId: teacher._id,
        room: 'R201',
        beaconConfig: { major: 1, minor: 201, rssiThreshold: -75 }
      }
    ];

    for (const cls of classes) {
      const existing = await Class.findOne({ classId: cls.classId });
      if (!existing) {
        await Class.create(cls);
        console.log(`  ✅ Created class: ${cls.name}`);
      } else {
        console.log(`  ⏭️  Class exists: ${cls.name}`);
      }
    }

    // 4. Create Test Students
    console.log('\n👨‍🎓 Creating test students...');
    const students = [
      { studentId: 'STU001', name: 'Alice Johnson', email: 'alice@student.com' },
      { studentId: 'STU002', name: 'Bob Smith', email: 'bob@student.com' },
      { studentId: 'STU003', name: 'Charlie Brown', email: 'charlie@student.com' },
      { studentId: 'STU004', name: 'Diana Ross', email: 'diana@student.com' },
      { studentId: 'STU005', name: 'Eve Wilson', email: 'eve@student.com' }
    ];

    for (const student of students) {
      const existing = await Student.findOne({ studentId: student.studentId });
      if (!existing) {
        await Student.create(student);
        console.log(`  ✅ Created student: ${student.name}`);
      } else {
        console.log(`  ⏭️  Student exists: ${student.name}`);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('🎉 Seed completed successfully!');
    console.log('='.repeat(50));
    console.log('\n📋 Summary:');
    console.log(`   Rooms: ${await Room.countDocuments()}`);
    console.log(`   Teachers: ${await Teacher.countDocuments()}`);
    console.log(`   Classes: ${await Class.countDocuments()}`);
    console.log(`   Students: ${await Student.countDocuments()}`);
    console.log('\n🔑 Test Login:');
    console.log(`   Email: teacher@test.com`);
    console.log(`   Password: password123`);
    console.log('');

  } catch (error) {
    console.error('❌ Seed error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

seedData();
