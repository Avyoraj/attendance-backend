/* Phase 1 Smoke Test: Check-in → Confirm → Today → RSSI Stream
   Usage: node scripts/phase1-smoke.js [baseUrl]
   Default baseUrl: http://localhost:3000
*/

const axios = require('axios');

(async () => {
  const base = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';
  const studentId = 'S_SMOKE';
  const classId = 'CS_SMOKE';
  const deviceIdHash = 'hash_smoke_1234';

  const api = axios.create({ baseURL: base, timeout: 10_000, headers: { 'Content-Type': 'application/json' } });

  const log = (title, obj) => {
    console.log(`\n=== ${title} ===`);
    console.log(JSON.stringify(obj, null, 2));
  };

  try {
    // 1) Check-in (provisional)
    const checkInRes = await api.post('/api/check-in', { studentId, classId, deviceIdHash, rssi: -65 });
    log('CHECK-IN', checkInRes.data);

    // 2) Confirm
    const confirmRes = await api.post('/api/attendance/confirm', { studentId, classId });
    log('CONFIRM', confirmRes.data);

    // 3) Today
    const todayRes = await api.get(`/api/attendance/today/${encodeURIComponent(studentId)}`);
    log('TODAY', todayRes.data);

    // 4) RSSI Stream
    const rssiRes = await api.post('/api/attendance/rssi-stream', {
      studentId,
      classId,
      sessionDate: new Date().toISOString().slice(0,10),
      rssiData: [{ timestamp: new Date().toISOString(), rssi: -64, distance: 1.2 }]
    });
    log('RSSI-STREAM', rssiRes.data);

    console.log('\n✅ Phase 1 smoke test completed');
  } catch (err) {
    if (err.response) {
      log('ERROR RESPONSE', { status: err.response.status, data: err.response.data });
    } else {
      console.error('❌ Smoke test failed:', err.message);
    }
    process.exit(1);
  }
})();
