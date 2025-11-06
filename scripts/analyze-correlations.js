/**
 * 🔍 RSSI Correlation Analysis Script
 * 
 * Automated background job to detect proxy attendance using Pearson correlation
 * 
 * Usage:
 * - Standalone: node scripts/analyze-correlations.js [classId] [date]
 * - Cron job: Run every 30 minutes to analyze recent sessions
 * - Manual: Call from API endpoint for specific session
 * 
 * Examples:
 *   node scripts/analyze-correlations.js
 *   node scripts/analyze-correlations.js "CS101" "2025-11-06"
 */

require('dotenv').config();
const mongoose = require('mongoose');
const RSSIStream = require('../models/RSSIStream');
const correlationService = require('../services/correlation.service');
const anomalyService = require('../services/anomaly.service');

/**
 * Main analysis function
 */
async function analyzeCorrelations(classId = null, sessionDate = null) {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 RSSI CORRELATION ANALYSIS STARTING');
  console.log('='.repeat(60) + '\n');

  try {
    // 1. Build query for RSSI streams
    const query = { totalReadings: { $gte: 10 } }; // Minimum 10 readings required

    if (classId) {
      query.classId = classId;
      console.log(`📍 Analyzing class: ${classId}`);
    }

    if (sessionDate) {
      const date = new Date(sessionDate);
      date.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      query.sessionDate = {
        $gte: date,
        $lte: endDate
      };
      console.log(`📅 Analyzing session: ${date.toDateString()}`);
    } else {
      // Default: Analyze last 24 hours
      const last24Hours = new Date();
      last24Hours.setHours(last24Hours.getHours() - 24);
      
      query.sessionDate = { $gte: last24Hours };
      console.log(`📅 Analyzing last 24 hours (since ${last24Hours.toLocaleString()})`);
    }

    // 2. Fetch RSSI streams
    const streams = await RSSIStream
      .find(query)
      .select('studentId classId sessionDate rssiData totalReadings')
      .lean();

    if (streams.length === 0) {
      console.log('⚠️ No RSSI streams found matching criteria');
      console.log('💡 Tip: Students need to check in and collect RSSI data first\n');
      return { analyzed: 0, flagged: 0 };
    }

    console.log(`\n✅ Found ${streams.length} RSSI streams to analyze\n`);

    // 3. Group by session (classId + sessionDate)
    const sessions = groupBySession(streams);
    console.log(`📊 Grouped into ${Object.keys(sessions).length} unique sessions\n`);

    let totalAnalyzed = 0;
    let totalFlagged = 0;

    // 4. Analyze each session
    for (const [sessionKey, sessionStreams] of Object.entries(sessions)) {
      const [sessionClassId, sessionDateStr] = sessionKey.split('|');
      const sessionDateObj = new Date(sessionDateStr);

      console.log('\n' + '-'.repeat(60));
      console.log(`📚 Session: ${sessionClassId} on ${sessionDateObj.toDateString()}`);
      console.log(`👥 Students: ${sessionStreams.length}`);
      console.log('-'.repeat(60));

      // Need at least 2 students to compare
      if (sessionStreams.length < 2) {
        console.log('⚠️ Only 1 student - skipping (need ≥2 for correlation)\n');
        continue;
      }

      // Run correlation analysis
      const analysisResults = correlationService.analyzeAllPairs(sessionStreams);

      // Generate summary
      const summary = correlationService.generateSummary(analysisResults.allResults);
      console.log('\n📊 Summary:');
      console.log(`   Total pairs: ${summary.count}`);
      console.log(`   Mean correlation: ${summary.mean}`);
      console.log(`   Range: [${summary.min}, ${summary.max}]`);
      console.log(`   Flagged: ${summary.flagged} (${summary.flaggedPercentage}%)`);

      // Create anomaly flags for suspicious pairs
      if (analysisResults.flaggedPairs.length > 0) {
        const createdAnomalies = await anomalyService.processAnalysisResults(
          sessionClassId,
          sessionDateObj,
          analysisResults
        );

        totalFlagged += createdAnomalies.length;
        console.log(`\n🚨 Created ${createdAnomalies.length} anomaly flags`);
      } else {
        console.log('\n✅ No suspicious correlations found');
      }

      totalAnalyzed += analysisResults.totalPairs;
    }

    // 5. Final summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ ANALYSIS COMPLETE');
    console.log('='.repeat(60));
    console.log(`📊 Total pairs analyzed: ${totalAnalyzed}`);
    console.log(`🚨 Total anomalies flagged: ${totalFlagged}`);
    console.log(`📈 Detection rate: ${totalAnalyzed > 0 ? ((totalFlagged / totalAnalyzed) * 100).toFixed(1) : 0}%`);
    console.log('='.repeat(60) + '\n');

    return {
      analyzed: totalAnalyzed,
      flagged: totalFlagged,
      sessions: Object.keys(sessions).length
    };

  } catch (error) {
    console.error('\n❌ ERROR during analysis:', error);
    throw error;
  }
}

/**
 * Group RSSI streams by session (classId + sessionDate)
 */
function groupBySession(streams) {
  const sessions = {};

  for (const stream of streams) {
    const date = new Date(stream.sessionDate);
    date.setHours(0, 0, 0, 0);
    const dateStr = date.toISOString().split('T')[0];
    
    const sessionKey = `${stream.classId}|${dateStr}`;

    if (!sessions[sessionKey]) {
      sessions[sessionKey] = [];
    }

    sessions[sessionKey].push(stream);
  }

  return sessions;
}

/**
 * Connect to MongoDB
 */
async function connectDB() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI not found in environment variables');
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
  });

  console.log('✅ Connected to MongoDB');
}

/**
 * Disconnect from MongoDB
 */
async function disconnectDB() {
  await mongoose.connection.close();
  console.log('👋 Disconnected from MongoDB\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const classId = args[0] || null;
    const sessionDate = args[1] || null;

    // Connect to database
    await connectDB();

    // Run analysis
    const results = await analyzeCorrelations(classId, sessionDate);

    // Disconnect
    await disconnectDB();

    // Exit with appropriate code
    process.exit(results.flagged > 0 ? 1 : 0);

  } catch (error) {
    console.error('\n💥 FATAL ERROR:', error);
    await disconnectDB();
    process.exit(1);
  }
}

// Run if called directly (not imported)
if (require.main === module) {
  main();
}

// Export for use as module
module.exports = {
  analyzeCorrelations,
  connectDB,
  disconnectDB
};
