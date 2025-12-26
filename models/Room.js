const mongoose = require('mongoose');

/**
 * Room Model
 * 
 * Maps physical beacons to rooms. A beacon is permanently installed in a room.
 * The room-to-class mapping is dynamic via Sessions.
 * 
 * Flow: Beacon Minor → Room → Active Session → Class
 */
const roomSchema = new mongoose.Schema({
  roomId: {
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
  building: {
    type: String,
    trim: true
  },
  floor: {
    type: String,
    trim: true
  },
  capacity: {
    type: Number,
    default: 50
  },
  // Beacon configuration - fixed per room
  beaconConfig: {
    uuid: {
      type: String,
      default: '215d0698-0b3d-34a6-a844-5ce2b2447f1a',
      trim: true
    },
    major: {
      type: Number,
      required: true,
      min: 0,
      max: 65535
    },
    minor: {
      type: Number,
      required: true,
      min: 0,
      max: 65535
    }
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
roomSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes
roomSchema.index({ roomId: 1 });
roomSchema.index({ 'beaconConfig.major': 1, 'beaconConfig.minor': 1 }, { unique: true });

module.exports = mongoose.model('Room', roomSchema);
