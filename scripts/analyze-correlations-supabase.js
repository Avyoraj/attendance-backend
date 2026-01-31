/**
 * 🔍 RSSI Correlation Analysis Script (Supabase Version)
 * 
 * Automated job to detect proxy attendance using Pearson correlation
 * 
 * Usage:
 *   node scripts/analyze-correlations-supabase.js
 *   node scripts/analyze-correlations-supabase.js "CS101" "2025-12-27"
 */

require('dotenv').config();
const { supabaseAdmin } = require('../utils/supabase');
const correlationService = require('../services/correlation.service');

/**
 * Main analysis function
 */
async function analyzeCorrelations(classId = null, sessionDate = null) {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 RSSI CORRELATION ANALYSIS (Supabase)');
  console.log('='.repeat(60) + '\n');

  try {
    // Build query
    let query = supabaseAdmin
      .from('rssi_streams')
      .select('*')
      .gte('sample_count', 10); // Minimum 10 readings

    if (classId) {
      query = query.eq('class_id', classId);
      console.log(`📍 Analyzing class: ${classId}`);
    }

    if (sessionDate) {
      query = query.eq('session_date', sessionDate);
      console.log(`📅 Analyzing session: ${sessionDate}`);
    } else {
      // Default: last 24 hours
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      query = query.gte('session_date', yesterday.toISOString().split('T')[0]);
      console.log(`📅 Analyzing last 24 hours`);
    }

    const { data: streams, error } = await query;

    if (error) throw error;

    if (!streams || streams.length === 0) {
      console.log('⚠️ No RSSI streams found');
      console.log('💡 Students need to check in and collect RSSI data first\n');
      return { analyzed: 0, flagged: 0 };
    }

    console.log(`\n✅ Found ${streams.length} RSSI streams\n`);

    // Group by session
    const sessions = groupBySession(streams);
    console.log(`📊 Grouped into ${Object.keys(sessions).length} sessions\n`);

    let totalAnalyzed = 0;
    let totalFlagged = 0;

    // Analyze each session
    for (const [sessionKey, sessionStreams] of Object.entries(sessions)) {
      const [sessionClassId, sessionDateStr] = sessionKey.split('|');

      console.log('\n' + '-'.repeat(60));
      console.log(`📚 Session: ${sessionClassId} on ${sessionDateStr}`);
      console.log(`👥 Students: ${sessionStreams.length}`);
      console.log('-'.repeat(60));

      if (sessionStreams.length < 2) {
        console.log('⚠️ Only 1 student - skipping\n');
        continue;
      }

      // Convert Supabase format to correlation service format
      const formattedStreams = sessionStreams.map(s => ({
        studentId: s.student_id,
        classId: s.class_id,
        rssiData: (s.rssi_data || []).map(d => ({
          timestamp: d.timestamp || d.t,
          rssi: d.rssi || d.r
        }))
      }));

      // Run correlation analysis
      const results = correlationService.analyzeAllPairs(formattedStreams);

      // Summary
      const summary = correlationService.generateSummary(results.allResults);
      console.log('\n📊 Summary:');
      console.log(`   Total pairs: ${summary.count}`);
      console.log(`   Mean correlation: ${summary.mean}`);
      console.log(`   Range: [${summary.min}, ${summary.max}]`);
      console.log(`   Flagged: ${summary.flagged} (${summary.flaggedPercentage}%)`);

      // Create anomalies for flagged pairs
      const proxyStudents = new Set();
      const pendingStudents = new Set();

      if (results.flaggedPairs.length > 0) {
        for (const pair of results.flaggedPairs) {
          const status = await createAnomaly(sessionClassId, sessionDateStr, pair);
          totalFlagged++;

          if (status === 'confirmed_proxy') {
            proxyStudents.add(pair.student1);
            proxyStudents.add(pair.student2);
          } else {
            pendingStudents.add(pair.student1);
            pendingStudents.add(pair.student2);
          }
        }
        console.log(`\n🚨 Created ${results.flaggedPairs.length} anomaly flags`);
      } else {
        console.log('\n✅ No suspicious correlations found');
      }

      // 🔄 UPDATE ATTENDANCE STATUS (Closing the Loop)
      console.log('\n🔄 Updating Attendance Status based on analysis...');
      const allStudents = sessionStreams.map(s => s.student_id);
      let updatedCount = 0;

      for (const studentId of allStudents) {
        let newStatus = 'confirmed'; // Default: Confirmed if no issues
        let reason = null;

        if (proxyStudents.has(studentId)) {
          newStatus = 'cancelled';
          reason = 'Proxy detected by automation';
        } else if (pendingStudents.has(studentId)) {
          newStatus = 'provisional'; // Keep provisional until reviewed
        }

        // Only update if status changes from provisional
        if (newStatus !== 'provisional') {
          const { error: updateError } = await supabaseAdmin
            .from('attendance')
            .update({ 
              status: newStatus,
              confirmed_at: newStatus === 'confirmed' ? new Date().toISOString() : null,
              cancelled_at: newStatus === 'cancelled' ? new Date().toISOString() : null,
              cancellation_reason: reason
            })
            .eq('student_id', studentId)
            .eq('class_id', sessionClassId)
            .eq('session_date', sessionDateStr)
            .eq('status', 'provisional');

          if (!updateError) {
            console.log(`   - ${studentId}: ${newStatus.toUpperCase()}`);
            updatedCount++;
          }
        }
      }
      console.log(`✅ Updated attendance status for ${updatedCount} students`);

      totalAnalyzed += results.totalPairs;
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ ANALYSIS COMPLETE');
    console.log('='.repeat(60));
    console.log(`📊 Total streams: ${streams.length}`);
    console.log(`📊 Total pairs analyzed: ${totalAnalyzed}`);
    console.log(`🚨 Total anomalies flagged: ${totalFlagged}`);
    console.log('='.repeat(60) + '\n');

    return { 
      streams: streams.length,
      analyzed: totalAnalyzed, 
      flagged: totalFlagged 
    };

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    throw error;
  }
}

/**
 * Group streams by session
 */
function groupBySession(streams) {
  const sessions = {};

  for (const stream of streams) {
    const sessionKey = `${stream.class_id}|${stream.session_date}`;
    if (!sessions[sessionKey]) sessions[sessionKey] = [];
    sessions[sessionKey].push(stream);
  }

  return sessions;
}

/**
 * Create anomaly in Supabase
 */
async function createAnomaly(classId, sessionDate, pair) {
  try {
    // Normalize student order to prevent duplicates (always store smaller ID first)
    const [s1, s2] = [pair.student1, pair.student2].sort();

    // Check if already exists (with normalized order)
    const { data: existing } = await supabaseAdmin
      .from('anomalies')
      .select('id, correlation_score')
      .eq('class_id', classId)
      .eq('session_date', sessionDate)
      .eq('student_id_1', s1)
      .eq('student_id_2', s2)
      .single();

    if (existing) {
      // Update if higher correlation
      if (pair.correlation > existing.correlation_score) {
        await supabaseAdmin
          .from('anomalies')
          .update({
            correlation_score: pair.correlation,
            severity: pair.severity === 'critical' ? 'critical' : 'warning',
            notes: pair.suspiciousDescription
          })
          .eq('id', existing.id);
        console.log(`📝 Updated anomaly: ${pair.student1} & ${pair.student2}`);
      }
      return;
    }

    // Determine status based on confidence tier
    let status = 'pending';
    let autoNotes = '';

    if (pair.correlation >= 0.98) {
      status = 'confirmed_proxy';
      autoNotes = '[AUTO-CONFIRMED] Extremely high correlation (>98%) indicates devices moving in perfect sync.';
    } else if (pair.stationaryCheck?.isSuspiciousStationary) {
      status = 'pending';
      autoNotes = '[STATIONARY] Devices appear to be sitting together on a desk (low variance).';
    }

    // Create new (with normalized student order)
    await supabaseAdmin
      .from('anomalies')
      .insert({
        class_id: classId,
        session_date: sessionDate,
        student_id_1: s1,
        student_id_2: s2,
        correlation_score: pair.correlation,
        severity: pair.severity === 'critical' ? 'critical' : 'warning',
        status: status,
        notes: `${autoNotes} ${pair.suspiciousDescription} | Data points: ${pair.dataPoints}`
      });

    const logIcon = status === 'confirmed_proxy' ? '🤖' : '🚨';
    console.log(`${logIcon} Created anomaly (${status}): ${s1} & ${s2} (ρ=${pair.correlation.toFixed(4)})`);
    
    return status;

  } catch (error) {
    console.error(`❌ Error creating anomaly:`, error.message);
    return 'error';
  }
}

/**
 * Run analysis with test data (for demo)
 */
async function runWithTestData() {
  console.log('\n🧪 RUNNING WITH SIMULATED TEST DATA\n');

  // Simulate two students with highly correlated RSSI (proxy scenario)
  const proxyStudent1 = [];
  const proxyStudent2 = [];
  const baseTime = Date.now();

  // Generate correlated RSSI data (phones side by side)
  for (let i = 0; i < 30; i++) {
    const baseRssi = -60 + Math.sin(i * 0.3) * 10; // Oscillating signal
    const noise1 = (Math.random() - 0.5) * 2;
    const noise2 = (Math.random() - 0.5) * 2;

    proxyStudent1.push({
      timestamp: new Date(baseTime + i * 5000).toISOString(),
      rssi: Math.round(baseRssi + noise1)
    });
    proxyStudent2.push({
      timestamp: new Date(baseTime + i * 5000).toISOString(),
      rssi: Math.round(baseRssi + noise2) // Very similar!
    });
  }

  // Simulate legitimate student (different location)
  const legitimateStudent = [];
  for (let i = 0; i < 30; i++) {
    legitimateStudent.push({
      timestamp: new Date(baseTime + i * 5000).toISOString(),
      rssi: Math.round(-75 + Math.random() * 15) // Different pattern
    });
  }

  const testStreams = [
    { studentId: 'PROXY_STU_1', classId: 'TEST_CLASS', rssiData: proxyStudent1 },
    { studentId: 'PROXY_STU_2', classId: 'TEST_CLASS', rssiData: proxyStudent2 },
    { studentId: 'LEGIT_STU_1', classId: 'TEST_CLASS', rssiData: legitimateStudent }
  ];

  console.log('📊 Test data generated:');
  console.log('   - PROXY_STU_1 & PROXY_STU_2: Highly correlated (side by side)');
  console.log('   - LEGIT_STU_1: Different location\n');

  // Run analysis
  const results = correlationService.analyzeAllPairs(testStreams);

  console.log('\n📊 Results:');
  for (const r of results.allResults) {
    const flag = r.suspicious ? '🚨 FLAGGED' : '✅ OK';
    console.log(`   ${r.student1} vs ${r.student2}: ρ = ${r.correlation.toFixed(4)} ${flag}`);
  }

  console.log(`\n🎯 Flagged pairs: ${results.flaggedCount}/${results.totalPairs}`);

  return results;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--test') {
    await runWithTestData();
  } else {
    const classId = args[0] || null;
    const sessionDate = args[1] || null;
    await analyzeCorrelations(classId, sessionDate);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { analyzeCorrelations, runWithTestData };
