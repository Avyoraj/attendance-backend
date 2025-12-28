/**
 * Clear Anomalies Data (Supabase Version)
 * 
 * Run this script to clear anomaly records for testing:
 * node clear-anomalies-supabase.js
 * 
 * Options:
 * - node clear-anomalies-supabase.js --all       : Clear ALL anomaly records
 * - node clear-anomalies-supabase.js --today     : Clear only today's records
 * - node clear-anomalies-supabase.js --pending   : Clear only pending anomalies
 * - node clear-anomalies-supabase.js --student STU001 : Clear anomalies for specific student
 * - node clear-anomalies-supabase.js --rssi      : Clear RSSI streams as well
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function clearAllAnomalies() {
  console.log('🗑️  Clearing ALL anomaly records...');
  
  const { error } = await supabase
    .from('anomalies')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  
  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }
  
  console.log('✅ All anomaly records cleared!');
}

async function clearTodayAnomalies() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`🗑️  Clearing anomalies for today (${today})...`);
  
  const { error } = await supabase
    .from('anomalies')
    .delete()
    .eq('session_date', today);
  
  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }
  
  console.log(`✅ Today's anomaly records cleared!`);
}

async function clearPendingAnomalies() {
  console.log('🗑️  Clearing PENDING anomalies only...');
  
  const { error } = await supabase
    .from('anomalies')
    .delete()
    .eq('status', 'pending');
  
  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }
  
  console.log('✅ Pending anomalies cleared!');
}

async function clearStudentAnomalies(studentId) {
  console.log(`🗑️  Clearing anomalies for student: ${studentId}...`);
  
  const { error } = await supabase
    .from('anomalies')
    .delete()
    .or(`student_id_1.eq.${studentId},student_id_2.eq.${studentId}`);
  
  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }
  
  console.log(`✅ Anomalies cleared for student ${studentId}!`);
}

async function clearRssiStreams() {
  console.log('🗑️  Clearing ALL RSSI streams...');
  
  const { error } = await supabase
    .from('rssi_streams')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  
  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }
  
  console.log('✅ All RSSI streams cleared!');
}

async function clearTodayRssiStreams() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`🗑️  Clearing RSSI streams for today (${today})...`);
  
  const { error } = await supabase
    .from('rssi_streams')
    .delete()
    .eq('session_date', today);
  
  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }
  
  console.log(`✅ Today's RSSI streams cleared!`);
}

async function showStats() {
  console.log('\n📊 Current Anomaly Stats:');
  
  const { count: totalCount } = await supabase
    .from('anomalies')
    .select('*', { count: 'exact', head: true });
  
  const { count: pendingCount } = await supabase
    .from('anomalies')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  
  const { count: confirmedCount } = await supabase
    .from('anomalies')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'confirmed_proxy');
  
  const { count: falsePositiveCount } = await supabase
    .from('anomalies')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'false_positive');
  
  const { count: rssiCount } = await supabase
    .from('rssi_streams')
    .select('*', { count: 'exact', head: true });
  
  console.log(`   - Total anomalies: ${totalCount || 0}`);
  console.log(`   - Pending: ${pendingCount || 0}`);
  console.log(`   - Confirmed proxy: ${confirmedCount || 0}`);
  console.log(`   - False positives: ${falsePositiveCount || 0}`);
  console.log(`   - RSSI streams: ${rssiCount || 0}`);
}

async function main() {
  const args = process.argv.slice(2);
  
  console.log('🧹 Anomaly Data Cleaner (Supabase)\n');
  
  await showStats();
  console.log('');
  
  if (args.includes('--all')) {
    await clearAllAnomalies();
    if (args.includes('--rssi')) {
      await clearRssiStreams();
    }
  } else if (args.includes('--today')) {
    await clearTodayAnomalies();
    if (args.includes('--rssi')) {
      await clearTodayRssiStreams();
    }
  } else if (args.includes('--pending')) {
    await clearPendingAnomalies();
  } else if (args.includes('--student') && args[args.indexOf('--student') + 1]) {
    await clearStudentAnomalies(args[args.indexOf('--student') + 1]);
  } else if (args.includes('--rssi')) {
    await clearRssiStreams();
  } else {
    console.log('Usage:');
    console.log('  node clear-anomalies-supabase.js --all           Clear all anomalies');
    console.log('  node clear-anomalies-supabase.js --all --rssi    Clear all anomalies + RSSI streams');
    console.log('  node clear-anomalies-supabase.js --today         Clear today\'s anomalies only');
    console.log('  node clear-anomalies-supabase.js --today --rssi  Clear today\'s anomalies + RSSI');
    console.log('  node clear-anomalies-supabase.js --pending       Clear pending anomalies only');
    console.log('  node clear-anomalies-supabase.js --student STU001  Clear specific student');
    console.log('  node clear-anomalies-supabase.js --rssi          Clear RSSI streams only');
    console.log('');
    console.log('Run with --all --rssi to clear everything for fresh testing.');
  }
  
  await showStats();
}

main().catch(console.error);
