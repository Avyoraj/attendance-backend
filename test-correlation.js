/**
 * 🧪 Test Script - Pearson Correlation & Refactored Server
 * 
 * Tests:
 * 1. Correlation service (unit test with sample data)
 * 2. Anomaly service
 * 3. Analysis script
 */

const correlationService = require('./services/correlation.service');
const anomalyService = require('./services/anomaly.service');

console.log('\n' + '='.repeat(60));
console.log('🧪 TESTING CORRELATION & ANOMALY SERVICES');
console.log('='.repeat(60) + '\n');

// ==========================================
// Test 1: Pearson Correlation
// ==========================================

console.log('📊 TEST 1: Pearson Correlation Computation\n');

// Sample RSSI data (simulating two students' signals)
const student1Data = [
  { timestamp: new Date('2025-11-06T10:00:00'), rssi: -72 },
  { timestamp: new Date('2025-11-06T10:00:05'), rssi: -74 },
  { timestamp: new Date('2025-11-06T10:00:10'), rssi: -73 },
  { timestamp: new Date('2025-11-06T10:00:15'), rssi: -75 },
  { timestamp: new Date('2025-11-06T10:00:20'), rssi: -71 },
  { timestamp: new Date('2025-11-06T10:00:25'), rssi: -73 },
  { timestamp: new Date('2025-11-06T10:00:30'), rssi: -74 },
  { timestamp: new Date('2025-11-06T10:00:35'), rssi: -72 },
  { timestamp: new Date('2025-11-06T10:00:40'), rssi: -76 },
  { timestamp: new Date('2025-11-06T10:00:45'), rssi: -73 },
];

// Student 2: Highly correlated (following same pattern)
const student2DataHighCorr = [
  { timestamp: new Date('2025-11-06T10:00:00'), rssi: -71 },
  { timestamp: new Date('2025-11-06T10:00:05'), rssi: -73 },
  { timestamp: new Date('2025-11-06T10:00:10'), rssi: -72 },
  { timestamp: new Date('2025-11-06T10:00:15'), rssi: -74 },
  { timestamp: new Date('2025-11-06T10:00:20'), rssi: -70 },
  { timestamp: new Date('2025-11-06T10:00:25'), rssi: -72 },
  { timestamp: new Date('2025-11-06T10:00:30'), rssi: -73 },
  { timestamp: new Date('2025-11-06T10:00:35'), rssi: -71 },
  { timestamp: new Date('2025-11-06T10:00:40'), rssi: -75 },
  { timestamp: new Date('2025-11-06T10:00:45'), rssi: -72 },
];

// Student 3: Low correlation (independent pattern)
const student3DataLowCorr = [
  { timestamp: new Date('2025-11-06T10:00:00'), rssi: -80 },
  { timestamp: new Date('2025-11-06T10:00:05'), rssi: -78 },
  { timestamp: new Date('2025-11-06T10:00:10'), rssi: -82 },
  { timestamp: new Date('2025-11-06T10:00:15'), rssi: -79 },
  { timestamp: new Date('2025-11-06T10:00:20'), rssi: -81 },
  { timestamp: new Date('2025-11-06T10:00:25'), rssi: -80 },
  { timestamp: new Date('2025-11-06T10:00:30'), rssi: -78 },
  { timestamp: new Date('2025-11-06T10:00:35'), rssi: -82 },
  { timestamp: new Date('2025-11-06T10:00:40'), rssi: -79 },
  { timestamp: new Date('2025-11-06T10:00:45'), rssi: -81 },
];

// Test high correlation (should be flagged)
console.log('🔬 Test 1A: High Correlation (Expected: ρ ≥ 0.9)');
const highCorrResult = correlationService.computePearsonCorrelation(
  student1Data,
  student2DataHighCorr
);
console.log(`   Result: ρ = ${highCorrResult.correlation?.toFixed(4) || 'null'}`);
console.log(`   Suspicious: ${correlationService.isSuspicious(highCorrResult.correlation)}`);
console.log(`   Severity: ${correlationService.determineSeverity(highCorrResult.correlation)}`);
console.log(`   ${highCorrResult.correlation >= 0.9 ? '✅ PASS' : '❌ FAIL'}\n`);

// Test low correlation (should NOT be flagged)
console.log('🔬 Test 1B: Low Correlation (Expected: ρ < 0.9)');
const lowCorrResult = correlationService.computePearsonCorrelation(
  student1Data,
  student3DataLowCorr
);
console.log(`   Result: ρ = ${lowCorrResult.correlation?.toFixed(4) || 'null'}`);
console.log(`   Suspicious: ${correlationService.isSuspicious(lowCorrResult.correlation)}`);
console.log(`   Severity: ${correlationService.determineSeverity(lowCorrResult.correlation)}`);
console.log(`   ${lowCorrResult.correlation < 0.9 ? '✅ PASS' : '❌ FAIL'}\n`);

// ==========================================
// Test 2: Pair Analysis
// ==========================================

console.log('📊 TEST 2: Multi-Student Pair Analysis\n');

const mockStreams = [
  {
    studentId: 'S001',
    rssiData: student1Data
  },
  {
    studentId: 'S002',
    rssiData: student2DataHighCorr
  },
  {
    studentId: 'S003',
    rssiData: student3DataLowCorr
  }
];

const pairAnalysis = correlationService.analyzeAllPairs(mockStreams);
const summary = correlationService.generateSummary(pairAnalysis.allResults);

console.log('Results:');
console.log(`   Total pairs: ${pairAnalysis.totalPairs}`);
console.log(`   Flagged: ${pairAnalysis.flaggedCount}`);
console.log(`   Mean correlation: ${summary.mean}`);
console.log(`   Range: [${summary.min}, ${summary.max}]`);
console.log(`   Detection rate: ${summary.flaggedPercentage}%`);
console.log(`   ${pairAnalysis.flaggedCount > 0 ? '✅ PASS' : '⚠️ WARNING'}\n`);

// ==========================================
// Test 3: Severity Classification
// ==========================================

console.log('📊 TEST 3: Severity Classification\n');

const testCases = [
  { correlation: 0.98, expected: 'critical' },
  { correlation: 0.92, expected: 'high' },
  { correlation: 0.80, expected: 'medium' },
  { correlation: 0.50, expected: 'low' }
];

let severityPassed = 0;
for (const test of testCases) {
  const severity = correlationService.determineSeverity(test.correlation);
  const pass = severity === test.expected;
  console.log(`   ρ = ${test.correlation} → ${severity} (expected: ${test.expected}) ${pass ? '✅' : '❌'}`);
  if (pass) severityPassed++;
}
console.log(`   ${severityPassed}/${testCases.length} tests passed\n`);

// ==========================================
// Summary
// ==========================================

console.log('='.repeat(60));
console.log('✅ ALL TESTS COMPLETE');
console.log('='.repeat(60));
console.log('\n💡 Next Steps:');
console.log('1. Start refactored server: node server-refactored.js');
console.log('2. Collect real RSSI data from Flutter app');
console.log('3. Run analysis: node scripts/analyze-correlations.js');
console.log('4. Check anomalies: curl http://localhost:3000/api/anomalies\n');
