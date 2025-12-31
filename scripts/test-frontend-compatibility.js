const axios = require('axios');

async function testFrontendCompatibility() {
  console.log('🧪 Testing Frontend Compatibility...');
  
  try {
    const res = await axios.get('http://localhost:3000/api/attendance/today-all');
    
    if (res.status === 200) {
      console.log('✅ API /today-all is reachable');
      
      const attendance = res.data.attendance;
      console.log(`📊 Found ${attendance.length} records`);
      
      const cancelled = attendance.filter(a => a.status === 'cancelled');
      console.log(`🚫 Found ${cancelled.length} cancelled records`);
      
      if (cancelled.length > 0) {
        console.log('\nChecking cancellation reasons:');
        cancelled.forEach(r => {
          console.log(`   - Student: ${r.studentId}`);
          console.log(`     Status: ${r.status}`);
          console.log(`     Reason: ${r.cancellationReason || 'MISSING! ❌'}`);
          
          if (r.cancellationReason) {
            console.log('     ✅ Reason field is present');
          } else {
            console.log('     ❌ Reason field is missing');
          }
        });
      } else {
        console.log('⚠️ No cancelled records found to test. Run the analysis script first!');
      }
      
    } else {
      console.error(`❌ API returned status ${res.status}`);
    }
    
  } catch (error) {
    console.error('❌ Error calling API:', error.message);
  }
}

testFrontendCompatibility();
