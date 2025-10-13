const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    ref: 'Student',
    index: true
  },
  classId: {
    type: String,
    required: true,
    index: true
  },
  deviceId: {
    type: String,
    required: true
  },
  
  // Two-Step Attendance Support
  status: {
    type: String,
    enum: ['provisional', 'confirmed', 'left_early', 'absent'],
    default: 'provisional'
  },
  
  // Timestamps
  checkInTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  confirmedAt: {
    type: Date // Set when status changes to 'confirmed'
  },
  
  // Co-Location Detection Support
  rssi: {
    type: Number,
    required: true
  },
  distance: {
    type: Number // Calculated distance in meters
  },
  
  // Metadata
  sessionDate: {
    type: Date,
    default: function() {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    },
    index: true
  },
  beaconMajor: {
    type: Number
  },
  beaconMinor: {
    type: Number
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to prevent duplicate check-ins
attendanceSchema.index({ studentId: 1, classId: 1, sessionDate: 1 }, { unique: true });

// Index for queries
attendanceSchema.index({ sessionDate: 1, status: 1 });
attendanceSchema.index({ studentId: 1, sessionDate: -1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
