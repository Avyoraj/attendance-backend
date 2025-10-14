/**
 * Clear Attendance Script (MongoDB)
 * 
 * This script helps clear attendance records for testing.
 * Usage:
 * 
 * 1. Clear all attendance: node clear-attendance.js
 * 2. Clear by student ID: node clear-attendance.js --student=32
 * 3. Clear by class ID: node clear-attendance.js --class=101
 * 4. Clear by date: node clear-attendance.js --date=2025-10-14
 */

require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

args.forEach(arg => {
  const [key, value] = arg.split('=');
  if (key && value) {
    options[key.replace('--', '')] = value;
  }
});

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance';

console.log('🔌 Connecting to MongoDB...');

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');

    // Get Attendance model
    const Attendance = mongoose.model('Attendance', new mongoose.Schema({}, { strict: false }));

    // Build query based on options
    const query = {};

    if (options.student) {
      query.studentId = options.student;
    }

    if (options.class) {
      query.classId = options.class;
    }

    if (options.date) {
      // Match records from the specified date
      const startDate = new Date(options.date);
      const endDate = new Date(options.date);
      endDate.setDate(endDate.getDate() + 1);
      query.checkInTime = {
        $gte: startDate.toISOString(),
        $lt: endDate.toISOString()
      };
    }

    // Count matching records
    const count = await Attendance.countDocuments(query);

    if (count === 0) {
      console.log('ℹ️  No records found matching criteria');
      await mongoose.connection.close();
      process.exit(0);
    }

    console.log(`\n⚠️  About to delete ${count} record(s)`);
    console.log('Query:', JSON.stringify(query, null, 2));
    console.log('');

    // Confirm deletion
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Proceed? (yes/no): ', async (answer) => {
      rl.close();

      if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
        console.log('❌ Deletion cancelled');
        await mongoose.connection.close();
        process.exit(0);
      }

      // Execute deletion
      const result = await Attendance.deleteMany(query);
      console.log(`✅ Successfully deleted ${result.deletedCount} record(s)`);

      // Show remaining records
      const remaining = await Attendance.find().sort({ checkInTime: -1 }).limit(10);
      
      console.log('\n📋 Recent remaining records:');
      if (remaining.length === 0) {
        console.log('  (no records)');
      } else {
        remaining.forEach(record => {
          console.log(`  - Student ${record.studentId}, Class ${record.classId}, Status: ${record.status}, Time: ${record.checkInTime}`);
        });
      }

      await mongoose.connection.close();
      process.exit(0);
    });
  })
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
