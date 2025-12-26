const mongoose = require('mongoose');

/**
 * Session Model
 * 
 * Represents an active class session in a room.
 * This is the "Session Activator" - when a teacher starts a class,
 * a session is created linking the room (beacon) to the class.
 * 
 * Flow: Teacher starts class → Session created → Students check in → Session ends
 */
const sessionSchema = new mongoose.Schema({
  // Links to room (which has the beacon)
  roomId: {
    type: String,
    required: true,
    ref: 'Room',
    index: true
  },
  // The class being taught
  classId: {
    type: String,
    required: true,
    index: true
  },
  className: {
    type: String,
    required: true
  },
  subject: {
    type: String
  },
  // Teacher who started the session
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true
  },
  teacherName: {
    type: String,
    required: true
  },
  // Session timing
  scheduledStart: {
    type: String  // e.g., "10:00" - from timetable
  },
  scheduledEnd: {
    type: String  // e.g., "11:00" - from timetable
  },
  actualStart: {
    type: Date,
    required: true,
    default: Date.now
  },
  actualEnd: {
    type: Date  // Set when teacher ends the session
  },
  // Session status
  status: {
    type: String,
    enum: ['active', 'ended', 'cancelled'],
    default: 'active',
    index: true
  },
  // Date for easy querying
  sessionDate: {
    type: Date,
    default: function() {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    },
    index: true
  },
  // Stats (updated as students check in)
  stats: {
    totalCheckins: { type: Number, default: 0 },
    confirmedCount: { type: Number, default: 0 },
    provisionalCount: { type: Number, default: 0 }
  },
  // Beacon info (denormalized for quick access)
  beaconMinor: {
    type: Number,
    required: true,
    index: true
  },
  beaconMajor: {
    type: Number,
    required: true
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
sessionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Compound index: only one active session per room at a time
sessionSchema.index(
  { roomId: 1, status: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { status: 'active' } 
  }
);

// Index for finding active session by beacon
sessionSchema.index({ beaconMinor: 1, beaconMajor: 1, status: 1 });

// Index for teacher's sessions
sessionSchema.index({ teacherId: 1, sessionDate: -1 });

module.exports = mongoose.model('Session', sessionSchema);
