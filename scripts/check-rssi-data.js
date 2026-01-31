require('dotenv').config();
const { supabaseAdmin } = require('../utils/supabase');

async function checkData() {
    console.log('🔍 Checking RSSI Data in Supabase...');

    const today = new Date().toISOString().split('T')[0];
    console.log(`📅 Checking for Date: ${today}`);

    try {
        // 1. Check Stream Count
        const { count, error: countError } = await supabaseAdmin
            .from('rssi_streams')
            .select('*', { count: 'exact', head: true })
            .eq('session_date', today);

        if (countError) throw countError;
        console.log(`📊 Total Streams Today: ${count}`);

        // 2. Fetch Sample Streams
        const { data: streams, error: fetchError } = await supabaseAdmin
            .from('rssi_streams')
            .select('student_id, sample_count, updated_at, class_id')
            .eq('session_date', today)
            .limit(5);

        if (fetchError) throw fetchError;

        if (streams.length === 0) {
            console.log('❌ No streams found for today!');
            console.log('   Possible causes: Phones not uploading, Date mismatch, or RLS blocking.');
        } else {
            console.log('✅ Found streams:', streams);
        }

    } catch (err) {
        console.error('❌ Error checking DB:', err.message);
    }
}

checkData();
