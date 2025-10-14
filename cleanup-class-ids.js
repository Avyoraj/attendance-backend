// Quick script to clean up non-numeric class IDs from MongoDB
// Run: node cleanup-class-ids.js

require('dotenv').config();
const mongoose = require('mongoose');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Attendance model (simplified)
const Attendance = mongoose.model('Attendance', new mongoose.Schema({
  studentId: String,
  classId: String,
  status: String,
  sessionDate: Date,
  checkInTime: Date,
}, { timestamps: true }));

// Main cleanup function
const cleanupClassIds = async () => {
  try {
    // Find all non-numeric class IDs
    const nonNumericRecords = await Attendance.find({
      classId: { $not: /^\d+$/ }  // Regex: not purely numeric
    });

    console.log(`\n📊 Found ${nonNumericRecords.length} records with non-numeric class IDs:`);
    
    if (nonNumericRecords.length === 0) {
      console.log('✅ No cleanup needed! All class IDs are numeric.');
      return;
    }

    // Group by class ID to show what we found
    const classIdCounts = {};
    nonNumericRecords.forEach(record => {
      classIdCounts[record.classId] = (classIdCounts[record.classId] || 0) + 1;
    });

    console.log('\n🔍 Non-numeric class IDs found:');
    Object.entries(classIdCounts).forEach(([classId, count]) => {
      console.log(`   - "${classId}": ${count} records`);
    });

    // Ask for confirmation (in real use, you'd prompt the user)
    console.log('\n⚠️  Choose an action:');
    console.log('   1. DELETE all non-numeric class ID records');
    console.log('   2. UPDATE CS1 → 101, CS2 → 102, etc.');
    console.log('   3. EXIT without changes');
    
    // For now, let's do OPTION 1 (DELETE)
    // Comment/uncomment based on what you want:

    // OPTION 1: DELETE
    const deleteResult = await Attendance.deleteMany({
      classId: { $not: /^\d+$/ }
    });
    console.log(`\n✅ DELETED ${deleteResult.deletedCount} records with non-numeric class IDs`);

    // OPTION 2: UPDATE (uncomment to use instead)
    /*
    const updateMapping = {
      'CS1': '101',
      'CS2': '102',
      'cs1': '101',
      'cs2': '102',
      // Add more mappings as needed
    };

    for (const [oldId, newId] of Object.entries(updateMapping)) {
      const result = await Attendance.updateMany(
        { classId: oldId },
        { $set: { classId: newId } }
      );
      if (result.modifiedCount > 0) {
        console.log(`✅ Updated "${oldId}" → "${newId}": ${result.modifiedCount} records`);
      }
    }
    */

    // Verify cleanup
    const remaining = await Attendance.find({
      classId: { $not: /^\d+$/ }
    });

    if (remaining.length === 0) {
      console.log('\n✅ Cleanup successful! All class IDs are now numeric.');
    } else {
      console.log(`\n⚠️  Warning: ${remaining.length} non-numeric records still remain.`);
    }

    // Show final stats
    const allRecords = await Attendance.find({});
    const numericRecords = await Attendance.find({
      classId: /^\d+$/
    });

    console.log('\n📊 Final Statistics:');
    console.log(`   Total records: ${allRecords.length}`);
    console.log(`   Numeric class IDs: ${numericRecords.length}`);
    console.log(`   Non-numeric class IDs: ${allRecords.length - numericRecords.length}`);

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
};

// Run the cleanup
const run = async () => {
  await connectDB();
  await cleanupClassIds();
  await mongoose.connection.close();
  console.log('\n👋 Database connection closed.');
  process.exit(0);
};

run();
