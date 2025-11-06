/**
 * 🚨 Anomaly Detection Service
 * 
 * Manages anomaly flags and detection logic for proxy attendance
 * Works with correlation service to identify suspicious patterns
 */

const AnomalyFlag = require('../models/AnomalyFlag');
const correlationService = require('./correlation.service');

class AnomalyService {
  /**
   * Create anomaly flag for suspicious correlation
   * 
   * @param {String} classId - Class identifier
   * @param {Date} sessionDate - Session date
   * @param {Array} flaggedUsers - Array of student IDs [student1, student2]
   * @param {Number} correlationScore - Pearson correlation coefficient
   * @param {String} severity - Severity level
   * @param {Object} metadata - Additional analysis data
   * @returns {Object} Created anomaly flag
   */
  async createAnomaly({
    classId,
    sessionDate,
    flaggedUsers,
    correlationScore,
    severity,
    metadata = {}
  }) {
    try {
      // Check if anomaly already exists for this pair in this session
      const existing = await this.findExistingAnomaly(classId, sessionDate, flaggedUsers);
      
      if (existing) {
        console.log(`⚠️ Anomaly already exists for ${flaggedUsers.join(' & ')} in ${classId}`);
        
        // Update existing if new correlation is higher
        if (correlationScore > existing.correlationScore) {
          existing.correlationScore = correlationScore;
          existing.severity = severity;
          existing.metadata = { ...existing.metadata, ...metadata };
          await existing.save();
          console.log(`📝 Updated existing anomaly with higher correlation: ${correlationScore.toFixed(4)}`);
        }
        
        return existing;
      }

      // Create new anomaly
      const anomaly = new AnomalyFlag({
        classId,
        sessionDate,
        flaggedUsers,
        correlationScore,
        severity,
        status: 'pending',
        metadata: {
          detectedAt: new Date(),
          dataPoints: metadata.dataPoints || 0,
          mean1: metadata.mean1 || null,
          mean2: metadata.mean2 || null,
          autoDetected: true,
          ...metadata
        }
      });

      await anomaly.save();

      console.log(`🚨 Anomaly created: ${flaggedUsers.join(' & ')} (ρ = ${correlationScore.toFixed(4)})`);

      return anomaly;
    } catch (error) {
      console.error('❌ Error creating anomaly:', error);
      throw error;
    }
  }

  /**
   * Find existing anomaly for the same student pair in session
   */
  async findExistingAnomaly(classId, sessionDate, flaggedUsers) {
    const sessionStart = new Date(sessionDate);
    sessionStart.setHours(0, 0, 0, 0);
    const sessionEnd = new Date(sessionDate);
    sessionEnd.setHours(23, 59, 59, 999);

    return await AnomalyFlag.findOne({
      classId,
      sessionDate: {
        $gte: sessionStart,
        $lte: sessionEnd
      },
      flaggedUsers: { $all: flaggedUsers }
    });
  }

  /**
   * Process correlation analysis results and create anomaly flags
   * 
   * @param {String} classId - Class identifier
   * @param {Date} sessionDate - Session date
   * @param {Object} analysisResults - Results from correlation analysis
   * @returns {Array} Created anomaly flags
   */
  async processAnalysisResults(classId, sessionDate, analysisResults) {
    const { flaggedPairs } = analysisResults;
    const createdAnomalies = [];

    console.log(`\n🔄 Processing ${flaggedPairs.length} flagged pairs...`);

    for (const pair of flaggedPairs) {
      try {
        const anomaly = await this.createAnomaly({
          classId,
          sessionDate,
          flaggedUsers: [pair.student1, pair.student2],
          correlationScore: pair.correlation,
          severity: pair.severity,
          metadata: {
            dataPoints: pair.dataPoints,
            mean1: pair.mean1,
            mean2: pair.mean2
          }
        });

        createdAnomalies.push(anomaly);
      } catch (error) {
        console.error(`❌ Error processing pair ${pair.student1} & ${pair.student2}:`, error);
      }
    }

    console.log(`✅ Created/updated ${createdAnomalies.length} anomaly flags`);

    return createdAnomalies;
  }

  /**
   * Get all anomalies for a class/session
   * 
   * @param {String} classId - Class identifier (optional)
   * @param {Date} sessionDate - Session date (optional)
   * @param {String} status - Filter by status (optional)
   * @returns {Array} Anomaly flags
   */
  async getAnomalies({ classId, sessionDate, status, limit = 100 }) {
    const query = {};

    if (classId) query.classId = classId;
    if (status) query.status = status;
    
    if (sessionDate) {
      const sessionStart = new Date(sessionDate);
      sessionStart.setHours(0, 0, 0, 0);
      const sessionEnd = new Date(sessionDate);
      sessionEnd.setHours(23, 59, 59, 999);
      
      query.sessionDate = {
        $gte: sessionStart,
        $lte: sessionEnd
      };
    }

    return await AnomalyFlag
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  /**
   * Update anomaly status after review
   * 
   * @param {String} anomalyId - Anomaly flag ID
   * @param {String} status - New status (reviewed, confirmed, dismissed)
   * @param {String} reviewedBy - Admin/Teacher ID
   * @param {String} reviewNotes - Review notes
   * @returns {Object} Updated anomaly
   */
  async updateAnomalyStatus(anomalyId, status, reviewedBy, reviewNotes) {
    const anomaly = await AnomalyFlag.findById(anomalyId);

    if (!anomaly) {
      throw new Error('Anomaly not found');
    }

    anomaly.status = status;
    anomaly.reviewedBy = reviewedBy;
    anomaly.reviewedAt = new Date();
    anomaly.reviewNotes = reviewNotes;

    await anomaly.save();

    console.log(`✅ Anomaly ${anomalyId} marked as ${status} by ${reviewedBy}`);

    return anomaly;
  }

  /**
   * Get anomaly statistics for dashboard
   * 
   * @param {String} classId - Class identifier (optional)
   * @param {Date} startDate - Start date (optional)
   * @param {Date} endDate - End date (optional)
   * @returns {Object} Statistics
   */
  async getStatistics({ classId, startDate, endDate }) {
    const query = {};

    if (classId) query.classId = classId;
    
    if (startDate || endDate) {
      query.sessionDate = {};
      if (startDate) query.sessionDate.$gte = new Date(startDate);
      if (endDate) query.sessionDate.$lte = new Date(endDate);
    }

    const [total, pending, reviewed, confirmed, dismissed] = await Promise.all([
      AnomalyFlag.countDocuments(query),
      AnomalyFlag.countDocuments({ ...query, status: 'pending' }),
      AnomalyFlag.countDocuments({ ...query, status: 'reviewed' }),
      AnomalyFlag.countDocuments({ ...query, status: 'confirmed' }),
      AnomalyFlag.countDocuments({ ...query, status: 'dismissed' })
    ]);

    // Get severity distribution
    const severityDistribution = await AnomalyFlag.aggregate([
      { $match: query },
      { $group: { _id: '$severity', count: { $sum: 1 } } }
    ]);

    // Get top flagged students
    const topFlaggedStudents = await AnomalyFlag.aggregate([
      { $match: query },
      { $unwind: '$flaggedUsers' },
      { $group: { _id: '$flaggedUsers', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    return {
      total,
      byStatus: {
        pending,
        reviewed,
        confirmed,
        dismissed
      },
      bySeverity: severityDistribution.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      topFlaggedStudents: topFlaggedStudents.map(item => ({
        studentId: item._id,
        flaggedCount: item.count
      }))
    };
  }

  /**
   * Delete old reviewed/dismissed anomalies (cleanup)
   * 
   * @param {Number} daysOld - Delete records older than X days
   * @returns {Number} Number of deleted records
   */
  async cleanupOldAnomalies(daysOld = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await AnomalyFlag.deleteMany({
      status: { $in: ['reviewed', 'dismissed'] },
      reviewedAt: { $lt: cutoffDate }
    });

    console.log(`🗑️ Cleaned up ${result.deletedCount} old anomalies (older than ${daysOld} days)`);

    return result.deletedCount;
  }
}

module.exports = new AnomalyService();
