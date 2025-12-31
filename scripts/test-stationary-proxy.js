/**
 * 🧪 Test Script - Stationary Proxy Detection
 * 
 * Scenario: "Phone Left in Class"
 * Two phones are sitting on a desk. They have:
 * 1. Very stable RSSI (Low Standard Deviation)
 * 2. Very similar signal strength (Low Mean Difference)
 * 
 * Even if their correlation is low (because there's no movement),
 * this should be flagged as a "Stationary Proxy".
 */

const correlationService = require('../services/correlation.service');

console.log('\n' + '='.repeat(60));
console.log('🧪 TESTING STATIONARY PROXY DETECTION');
console.log('='.repeat(60) + '\n');

// ==========================================
// Scenario: Two phones on a desk
// ==========================================

// Phone A: Very stable signal around -60 dBm
const phoneA = [
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

// Phone B: Very stable signal around -61 dBm (Next to Phone A)
// Random noise to ensure low correlation
const phoneB = [
  { timestamp: new Date('2025-11-06T10:00:00'), rssi: -61 },
  { timestamp: new Date('2025-11-06T10:00:05'), rssi: -60 }, // Changed
  { timestamp: new Date('2025-11-06T10:00:10'), rssi: -61 }, // Changed
  { timestamp: new Date('2025-11-06T10:00:15'), rssi: -61 },
  { timestamp: new Date('2025-11-06T10:00:20'), rssi: -60 }, // Changed
  { timestamp: new Date('2025-11-06T10:00:25'), rssi: -61 }, // Changed
  { timestamp: new Date('2025-11-06T10:00:30'), rssi: -61 },
  { timestamp: new Date('2025-11-06T10:00:35'), rssi: -60 }, // Changed
  { timestamp: new Date('2025-11-06T10:00:40'), rssi: -61 }, // Changed
  { timestamp: new Date('2025-11-06T10:00:45'), rssi: -61 },
];

console.log('📊 Analyzing Stationary Pair...');

// 1. Compute Correlation & Stats
const result = correlationService.computePearsonCorrelation(phoneA, phoneB);

console.log(`\n📈 Statistics:`);
console.log(`   Correlation (ρ): ${result.correlation.toFixed(4)}`);
console.log(`   Phone A: Mean=${result.mean1} dBm, StdDev=${result.stdDev1}`);
console.log(`   Phone B: Mean=${result.mean2} dBm, StdDev=${result.stdDev2}`);
console.log(`   Mean Difference: ${Math.abs(result.mean1 - result.mean2).toFixed(2)} dBm`);

// 2. Check Stationary Logic
console.log(`\n🪑 Stationary Check Result:`);
console.log(`   Is Stationary? ${result.stationaryCheck.isStationary}`);
console.log(`   Is Same Location? ${result.stationaryCheck.isSameLocation}`);
console.log(`   Is Suspicious? ${result.stationaryCheck.isSuspiciousStationary}`);

// 3. Final Verdict
const verdict = correlationService.isSuspicious(result.correlation, result.stationaryCheck);

console.log(`\n🚨 Final Verdict:`);
console.log(`   Suspicious: ${verdict.suspicious}`);
console.log(`   Reason: ${verdict.reason}`);
console.log(`   Description: ${verdict.description}`);

if (verdict.suspicious && verdict.reason === 'stationary_proxy') {
  console.log('\n✅ TEST PASSED: Stationary Proxy successfully detected!');
} else {
  console.log('\n❌ TEST FAILED: Failed to detect stationary proxy.');
}
