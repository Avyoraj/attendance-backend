const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    sparse: true, // Allows multiple null values
    lowercase: true,
    trim: true
  },
  deviceId: {
    type: String,
    sparse: true, // Allows null initially, unique when set
    index: true
  },
  deviceRegisteredAt: {
    type: Date
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
studentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster queries
studentSchema.index({ studentId: 1, deviceId: 1 });

module.exports = mongoose.model('Student', studentSchema);
