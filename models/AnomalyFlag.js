const mongoose = require('mongoose');

const anomalyFlagSchema = new mongoose.Schema({
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
  
  // Flagged student pairs
  flaggedUsers: [{
    type: String,
    ref: 'Student'
  }],
  
  // Analysis results
  correlationScore: {
    type: Number,
    required: true,
    min: -1,
    max: 1
  },
  
  // Severity based on correlation
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'confirmed', 'dismissed'],
    default: 'pending'
  },
  
  // Admin review
  reviewedBy: {
    type: String // Admin ID
  },
  reviewedAt: {
    type: Date
  },
  reviewNotes: {
    type: String
  },
  
  // Detection metadata
  detectedAt: {
    type: Date,
    default: Date.now
  },
  analysisMethod: {
    type: String,
    default: 'pearson_correlation'
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for queries
anomalyFlagSchema.index({ sessionDate: -1, status: 1 });
anomalyFlagSchema.index({ classId: 1, sessionDate: -1 });

module.exports = mongoose.model('AnomalyFlag', anomalyFlagSchema);
