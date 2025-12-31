const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { supabaseAdmin } = require('../utils/supabase');

async function createFakeAnomaly() {
  console.log('Creating a fake anomaly for dashboard verification...');

  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabaseAdmin
    .from('anomalies')
    .insert({
      student_id_1: 'S123',
      student_id_2: 'S999', // Fake student
      class_id: 'CS101',
      session_date: today,
      correlation_score: 0.98,
      status: 'pending',
      severity: 'critical',
      notes: 'High correlation detected (Manual Test)'
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating anomaly:', error);
  } else {
    console.log('✅ Fake anomaly created!');
    console.log(`   ID: ${data.id}`);
    console.log(`   Students: ${data.student_id_1} & ${data.student_id_2}`);
    console.log('👉 Check the React Dashboard "Live Anomalies" page now.');
  }
}

createFakeAnomaly();
