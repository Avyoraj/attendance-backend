const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { supabaseAdmin } = require('../utils/supabase');

async function seedTestData() {
  console.log('🌱 Seeding RSSI data for automation test...');

  const CLASS_ID = 'TEST_AUTO_CLASS';
  const DATE = new Date().toISOString().split('T')[0];
  
  // 1. Clean up previous test data
  await supabaseAdmin.from('rssi_streams').delete().eq('class_id', CLASS_ID);
  await supabaseAdmin.from('anomalies').delete().eq('class_id', CLASS_ID);

  // 2. Generate Base Signal A (Sine wave)
  const baseSignalA = [];
  const now = Date.now();
  for (let i = 0; i < 20; i++) {
    baseSignalA.push({
      t: now + (i * 1000),
      r: -60 + Math.sin(i) * 10
    });
  }

  // 3. Generate Base Signal B (Cosine wave - different pattern)
  const baseSignalB = [];
  for (let i = 0; i < 20; i++) {
    baseSignalB.push({
      t: now + (i * 1000),
      r: -65 + Math.cos(i) * 8 // Different amplitude and phase
    });
  }

  // 4. Create Pair A (Perfect Match -> Should be Auto-Confirmed)
  const studentA1 = {
    student_id: 'AUTO_BOT_1',
    class_id: CLASS_ID,
    session_date: DATE,
    rssi_data: baseSignalA,
    sample_count: 20
  };

  const studentA2 = {
    student_id: 'AUTO_BOT_2',
    class_id: CLASS_ID,
    session_date: DATE,
    rssi_data: baseSignalA, // Identical
    sample_count: 20
  };

  // 5. Create Pair B (High Correlation -> Should be Pending)
  // Add significant noise to get correlation ~0.90
  const noisySignalB = baseSignalB.map(p => ({
    t: p.t,
    r: p.r + (Math.random() * 12 - 6) // +/- 6dBm noise (increased from 2)
  }));

  const studentB1 = {
    student_id: 'MANUAL_USER_1',
    class_id: CLASS_ID,
    session_date: DATE,
    rssi_data: baseSignalB,
    sample_count: 20
  };

  const studentB2 = {
    student_id: 'MANUAL_USER_2',
    class_id: CLASS_ID,
    session_date: DATE,
    rssi_data: noisySignalB,
    sample_count: 20
  };

  // 6. Insert into Supabase (RSSI Streams)
  const { error: rssiError } = await supabaseAdmin
    .from('rssi_streams')
    .insert([studentA1, studentA2, studentB1, studentB2]);

  if (rssiError) {
    console.error('❌ Error seeding RSSI data:', rssiError);
    return;
  }

  // 7. Insert Attendance Records (Pillar 1 - Provisional)
  // We need these so they show up in "Today's Attendance"
  const attendanceRecords = [
    { student_id: 'AUTO_BOT_1', class_id: CLASS_ID, session_date: DATE, status: 'provisional', device_id: 'dev_auto_1', check_in_time: new Date().toISOString() },
    { student_id: 'AUTO_BOT_2', class_id: CLASS_ID, session_date: DATE, status: 'provisional', device_id: 'dev_auto_2', check_in_time: new Date().toISOString() },
    { student_id: 'MANUAL_USER_1', class_id: CLASS_ID, session_date: DATE, status: 'provisional', device_id: 'dev_man_1', check_in_time: new Date().toISOString() },
    { student_id: 'MANUAL_USER_2', class_id: CLASS_ID, session_date: DATE, status: 'provisional', device_id: 'dev_man_2', check_in_time: new Date().toISOString() }
  ];

  // Clean up old attendance for these users first
  await supabaseAdmin.from('attendance').delete().eq('class_id', CLASS_ID);

  const { error: attError } = await supabaseAdmin
    .from('attendance')
    .insert(attendanceRecords);

  if (attError) {
    console.error('❌ Error seeding attendance records:', attError);
  } else {
    console.log('✅ Test data seeded successfully!');
    console.log('   - Pillar 1 (Attendance): Created 4 provisional records');
    console.log('   - Pillar 2 (RSSI): Created 4 data streams');
    console.log('   - Pair A: AUTO_BOT_1 & AUTO_BOT_2 (Identical Signal)');
    console.log('   - Pair B: MANUAL_USER_1 & MANUAL_USER_2 (Noisy Signal)');
    console.log('\n👉 Now run: node scripts/analyze-correlations-supabase.js');
  }
}

seedTestData();
