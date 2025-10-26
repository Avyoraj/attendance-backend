const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  classId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  subject: {
    type: String,
    trim: true
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true
  },
  // Schedule configuration
  schedule: {
    monday: [{
      start: String,    // e.g., "10:00"
      end: String       // e.g., "11:30"
    }],
    tuesday: [{
      start: String,
      end: String
    }],
    wednesday: [{
      start: String,
      end: String
    }],
    thursday: [{
      start: String,
      end: String
    }],
    friday: [{
      start: String,
      end: String
    }],
    saturday: [{
      start: String,
      end: String
    }],
    sunday: [{
      start: String,
      end: String
    }]
  },
  // Students enrolled in this class (student IDs)
  students: [{
    type: String,
    ref: 'Student'
  }],
  // Beacon configuration for this class
  beaconConfig: {
    uuid: {
      type: String,
      trim: true
    },
    major: {
      type: Number,
      min: 0,
      max: 65535
    },
    minor: {
      type: Number,
      min: 0,
      max: 65535
    },
    rssiThreshold: {
      type: Number,
      default: -75  // Default RSSI threshold
    }
  },
  // Class settings
  room: {
    type: String,
    trim: true
  },
  semester: {
    type: String,
    trim: true
  },
  academicYear: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
classSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for faster queries
classSchema.index({ classId: 1 });
classSchema.index({ teacherId: 1 });
classSchema.index({ 'beaconConfig.major': 1, 'beaconConfig.minor': 1 });

module.exports = mongoose.model('Class', classSchema);
