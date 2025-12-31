const axios = require('axios');

async function testApi() {
  try {
    console.log('Fetching anomalies...');
    const res = await axios.get('http://localhost:3000/api/anomalies?status=pending');
    console.log('Status:', res.status);
    console.log('Data:', JSON.stringify(res.data, null, 2));

    if (res.data.anomalies && res.data.anomalies.length > 0) {
      const firstId = res.data.anomalies[0].id;
      console.log('First Anomaly ID:', firstId);
      
      if (!firstId) {
        console.error('❌ ID is missing in the response!');
      } else {
        console.log('✅ ID is present.');
      }
    } else {
      console.log('No pending anomalies found.');
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testApi();
