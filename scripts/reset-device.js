const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { supabaseAdmin } = require('../utils/supabase');

const studentId = process.argv[2] || 'S123';

async function resetDevice() {
  console.log(`Resetting device binding for student: ${studentId}...`);
  
  const { data, error } = await supabaseAdmin
    .from('students')
    .update({ device_id: null })
    .eq('student_id', studentId)
    .select();

  if (error) {
    console.error('Error resetting device:', error);
    process.exit(1);
  }

  if (data && data.length > 0) {
    console.log('✅ Device binding cleared successfully.');
  } else {
    console.log('⚠️ Student not found or no change made.');
  }
}

resetDevice();
