const mongoose = require('mongoose');

const rssiStreamSchema = new mongoose.Schema({
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
  sessionDate: {
    type: Date,
    required: true,
    index: true
  },
  
  // Time-series RSSI data
  rssiData: [{
    timestamp: {
      type: Date,
      required: true
    },
    rssi: {
      type: Number,
      required: true
    },
    distance: {
      type: Number
    },
    // For time sync debugging
    originalTimestamp: {
      type: Date
    },
    clockOffsetMs: {
      type: Number
    }
  }],
  
  // Metadata
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  },
  totalReadings: {
    type: Number,
    default: 0
  },
  
  // Clock drift tracking for this device
  // Positive = device behind server, Negative = device ahead
  lastClockOffsetMs: {
    type: Number
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for efficient queries
rssiStreamSchema.index({ classId: 1, sessionDate: 1, studentId: 1 });

// Update totalReadings before save
rssiStreamSchema.pre('save', function(next) {
  this.totalReadings = this.rssiData.length;
  next();
});

module.exports = mongoose.model('RSSIStream', rssiStreamSchema);
