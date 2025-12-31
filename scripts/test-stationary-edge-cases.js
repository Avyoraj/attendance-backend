/**
 * 🧪 Test Script - Stationary Proxy Edge Cases
 * 
 * Verifies that we don't generate FALSE POSITIVES.
 * 
 * Scenarios:
 * 1. One Stationary, One Moving (Should PASS - Not Suspicious)
 * 2. Two Stationary, Different Locations (Should PASS - Not Suspicious)
 */

const correlationService = require('../services/correlation.service');

console.log('\n' + '='.repeat(60));
console.log('🧪 TESTING STATIONARY PROXY EDGE CASES');
console.log('='.repeat(60) + '\n');

// ==========================================
// Scenario 1: One Stationary, One Moving
// ==========================================
console.log('📊 Scenario 1: One Stationary, One Moving');
console.log('   (Student A is sitting still, Student B is walking around)');

// Phone A: Very stable signal around -60 dBm
const phoneStationary = [
  { timestamp: new Date('2025-11-06T10:00:00'), rssi: -60 },
  { timestamp: new Date('2025-11-06T10:00:05'), rssi: -60 },
  { timestamp: new Date('2025-11-06T10:00:10'), rssi: -61 },
  { timestamp: new Date('2025-11-06T10:00:15'), rssi: -60 },
  { timestamp: new Date('2025-11-06T10:00:20'), rssi: -60 },
  { timestamp: new Date('2025-11-06T10:00:25'), rssi: -61 },
  { timestamp: new Date('2025-11-06T10:00:30'), rssi: -60 },
  { timestamp: new Date('2025-11-06T10:00:35'), rssi: -60 },
  { timestamp: new Date('2025-11-06T10:00:40'), rssi: -61 },
  { timestamp: new Date('2025-11-06T10:00:45'), rssi: -60 },
];

// Phone B: Moving (High Variance)
const phoneMoving = [
  { timestamp: new Date('2025-11-06T10:00:00'), rssi: -70 },
  { timestamp: new Date('2025-11-06T10:00:05'), rssi: -65 },
  { timestamp: new Date('2025-11-06T10:00:10'), rssi: -75 },
  { timestamp: new Date('2025-11-06T10:00:15'), rssi: -68 },
  { timestamp: new Date('2025-11-06T10:00:20'), rssi: -72 },
  { timestamp: new Date('2025-11-06T10:00:25'), rssi: -64 },
  { timestamp: new Date('2025-11-06T10:00:30'), rssi: -78 },
  { timestamp: new Date('2025-11-06T10:00:35'), rssi: -69 },
  { timestamp: new Date('2025-11-06T10:00:40'), rssi: -73 },
  { timestamp: new Date('2025-11-06T10:00:45'), rssi: -66 },
];

const result1 = correlationService.computePearsonCorrelation(phoneStationary, phoneMoving);
const verdict1 = correlationService.isSuspicious(result1.correlation, result1.stationaryCheck);

console.log(`   StdDev A: ${result1.stdDev1} (Stationary)`);
console.log(`   StdDev B: ${result1.stdDev2} (Moving)`);
console.log(`   Suspicious: ${verdict1.suspicious}`);
if (!verdict1.suspicious) {
    console.log('   ✅ PASS: Correctly identified as NOT a proxy.');
} else {
    console.log(`   ❌ FAIL: False positive! Reason: ${verdict1.reason}`);
}


// ==========================================
// Scenario 2: Two Stationary, Different Locations
// ==========================================
console.log('\n📊 Scenario 2: Two Stationary, Different Locations');
console.log('   (Student A is at front of class, Student B is at back)');

// Phone C: Stable at -80 dBm (Far away)
const phoneStationaryFar = [
  { timestamp: new Date('2025-11-06T10:00:00'), rssi: -80 },
  { timestamp: new Date('2025-11-06T10:00:05'), rssi: -80 },
  { timestamp: new Date('2025-11-06T10:00:10'), rssi: -81 },
  { timestamp: new Date('2025-11-06T10:00:15'), rssi: -80 },
  { timestamp: new Date('2025-11-06T10:00:20'), rssi: -80 },
  { timestamp: new Date('2025-11-06T10:00:25'), rssi: -81 },
  { timestamp: new Date('2025-11-06T10:00:30'), rssi: -80 },
  { timestamp: new Date('2025-11-06T10:00:35'), rssi: -80 },
  { timestamp: new Date('2025-11-06T10:00:40'), rssi: -81 },
  { timestamp: new Date('2025-11-06T10:00:45'), rssi: -80 },
];

const result2 = correlationService.computePearsonCorrelation(phoneStationary, phoneStationaryFar);
const verdict2 = correlationService.isSuspicious(result2.correlation, result2.stationaryCheck);

console.log(`   Mean A: ${result2.mean1} dBm`);
console.log(`   Mean B: ${result2.mean2} dBm`);
console.log(`   Diff: ${Math.abs(result2.mean1 - result2.mean2).toFixed(2)} dBm`);
console.log(`   Suspicious: ${verdict2.suspicious}`);

if (!verdict2.suspicious) {
    console.log('   ✅ PASS: Correctly identified as NOT a proxy (Different locations).');
} else {
    console.log(`   ❌ FAIL: False positive! Reason: ${verdict2.reason}`);
}
