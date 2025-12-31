const axios = require('axios');

async function testReview() {
  const anomalyId = 'be863f89-c8df-4efa-8967-cdc5c6ccad8a'; // From previous output
  const url = `http://localhost:3000/api/anomalies/${anomalyId}`;

  console.log(`Testing PUT ${url}...`);

  try {
    const res = await axios.put(url, {
      status: 'confirmed_proxy',
      reviewNotes: 'Confirmed by test script'
    });

    console.log('✅ Success!');
    console.log('Status:', res.status);
    console.log('Data:', res.data);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testReview();
