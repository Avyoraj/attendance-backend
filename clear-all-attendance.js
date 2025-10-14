/**
 * Quick Clear All Attendance Records (MongoDB)
 * 
 * WARNING: This will delete ALL attendance records immediately!
 * Usage: node clear-all-attendance.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance';

console.log('🔌 Connecting to MongoDB...');

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');

    // Get Attendance model
    const Attendance = mongoose.model('Attendance', new mongoose.Schema({}, { strict: false }));

    // Count current records
    const count = await Attendance.countDocuments();
    console.log(`📊 Found ${count} record(s) to delete`);

    if (count === 0) {
      console.log('ℹ️  Database is already empty');
      await mongoose.connection.close();
      process.exit(0);
    }

    // Delete all records
    const result = await Attendance.deleteMany({});
    console.log(`✅ Successfully deleted ${result.deletedCount} record(s)`);
    console.log('🧹 Attendance database cleared!');

    await mongoose.connection.close();
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
