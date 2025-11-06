/**
 * 📊 Correlation Analysis Service
 * 
 * Implements Pearson Correlation Coefficient computation for RSSI time series
 * Used to detect proxy attendance (one person carrying multiple devices)
 * 
 * Formula:
 * ρ(xy) = Σ(Rx,t - R̄x)(Ry,t - R̄y) / √[Σ(Rx,t - R̄x)² × Σ(Ry,t - R̄y)²]
 * 
 * Threshold: ρ ≥ 0.9 indicates high correlation (possible proxy)
 */

class CorrelationService {
  /**
   * Compute Pearson Correlation Coefficient between two RSSI time series
   * 
   * @param {Array} rssiData1 - First RSSI time series [{timestamp, rssi}, ...]
   * @param {Array} rssiData2 - Second RSSI time series [{timestamp, rssi}, ...]
   * @returns {Object} { correlation, aligned1, aligned2, commonTimestamps }
   */
  computePearsonCorrelation(rssiData1, rssiData2) {
    // 1. Align time series (match by timestamp)
    const { aligned1, aligned2, timestamps } = this.alignTimeSeries(rssiData1, rssiData2);

    // 2. Check if we have enough data points
    if (aligned1.length < 10) {
      console.warn(`⚠️ Insufficient data points for correlation: ${aligned1.length} (minimum: 10)`);
      return {
        correlation: null,
        reason: 'insufficient_data',
        dataPoints: aligned1.length,
        aligned1,
        aligned2,
        commonTimestamps: timestamps
      };
    }

    // 3. Calculate means
    const mean1 = this.calculateMean(aligned1);
    const mean2 = this.calculateMean(aligned2);

    // 4. Calculate Pearson correlation
    const correlation = this.pearsonFormula(aligned1, aligned2, mean1, mean2);

    console.log(`📊 Correlation computed: ρ = ${correlation.toFixed(4)} (${aligned1.length} data points)`);

    return {
      correlation,
      dataPoints: aligned1.length,
      mean1: mean1.toFixed(2),
      mean2: mean2.toFixed(2),
      aligned1,
      aligned2,
      commonTimestamps: timestamps
    };
  }

  /**
   * Pearson correlation formula implementation
   * ρ = Σ((x - x̄)(y - ȳ)) / √(Σ(x - x̄)² × Σ(y - ȳ)²)
   */
  pearsonFormula(data1, data2, mean1, mean2) {
    let numerator = 0;     // Σ((x - x̄)(y - ȳ))
    let sumSqDiff1 = 0;    // Σ(x - x̄)²
    let sumSqDiff2 = 0;    // Σ(y - ȳ)²

    for (let i = 0; i < data1.length; i++) {
      const diff1 = data1[i] - mean1;
      const diff2 = data2[i] - mean2;

      numerator += diff1 * diff2;
      sumSqDiff1 += diff1 * diff1;
      sumSqDiff2 += diff2 * diff2;
    }

    // Handle edge case: zero variance (all values identical)
    if (sumSqDiff1 === 0 || sumSqDiff2 === 0) {
      console.warn('⚠️ Zero variance detected - all RSSI values identical');
      return 0;
    }

    const denominator = Math.sqrt(sumSqDiff1 * sumSqDiff2);
    const correlation = numerator / denominator;

    return correlation;
  }

  /**
   * Align two RSSI time series by matching timestamps
   * 
   * @param {Array} rssiData1 - [{timestamp: Date, rssi: Number}, ...]
   * @param {Array} rssiData2 - [{timestamp: Date, rssi: Number}, ...]
   * @returns {Object} { aligned1, aligned2, timestamps }
   */
  alignTimeSeries(rssiData1, rssiData2) {
    // Convert timestamps to milliseconds for comparison
    const map1 = new Map();
    const map2 = new Map();

    rssiData1.forEach(item => {
      const timeKey = new Date(item.timestamp).getTime();
      map1.set(timeKey, item.rssi);
    });

    rssiData2.forEach(item => {
      const timeKey = new Date(item.timestamp).getTime();
      map2.set(timeKey, item.rssi);
    });

    // Find common timestamps (with tolerance of ±2 seconds)
    const aligned1 = [];
    const aligned2 = [];
    const timestamps = [];
    const tolerance = 2000; // 2 seconds in milliseconds

    const times1 = Array.from(map1.keys()).sort();
    const times2 = Array.from(map2.keys()).sort();

    // Match timestamps within tolerance window
    for (const time1 of times1) {
      for (const time2 of times2) {
        if (Math.abs(time1 - time2) <= tolerance) {
          aligned1.push(map1.get(time1));
          aligned2.push(map2.get(time2));
          timestamps.push(new Date(time1));
          break;
        }
      }
    }

    console.log(`🔗 Aligned ${aligned1.length} common data points from ${rssiData1.length} and ${rssiData2.length} readings`);

    return { aligned1, aligned2, timestamps };
  }

  /**
   * Calculate mean of array
   */
  calculateMean(data) {
    if (data.length === 0) return 0;
    const sum = data.reduce((acc, val) => acc + val, 0);
    return sum / data.length;
  }

  /**
   * Determine severity level based on correlation score
   * 
   * @param {Number} correlation - Pearson correlation coefficient (-1 to 1)
   * @returns {String} Severity: 'critical', 'high', 'medium', or 'low'
   */
  determineSeverity(correlation) {
    const absCorr = Math.abs(correlation);

    if (absCorr >= 0.95) return 'critical';  // Almost perfect correlation
    if (absCorr >= 0.9) return 'high';       // Strong correlation (threshold)
    if (absCorr >= 0.75) return 'medium';    // Moderate correlation
    return 'low';                             // Weak correlation
  }

  /**
   * Check if correlation indicates proxy behavior
   * 
   * @param {Number} correlation - Pearson correlation coefficient
   * @returns {Boolean} True if suspicious (ρ ≥ 0.9)
   */
  isSuspicious(correlation) {
    return Math.abs(correlation) >= 0.9;
  }

  /**
   * Analyze all student pairs in a session
   * 
   * @param {Array} rssiStreams - Array of RSSIStream documents
   * @returns {Array} Array of correlation results with flagged pairs
   */
  analyzeAllPairs(rssiStreams) {
    console.log(`\n🔍 Analyzing ${rssiStreams.length} students for correlations...`);

    const results = [];
    const flaggedPairs = [];

    // Compare each pair of students
    for (let i = 0; i < rssiStreams.length; i++) {
      for (let j = i + 1; j < rssiStreams.length; j++) {
        const stream1 = rssiStreams[i];
        const stream2 = rssiStreams[j];

        console.log(`\n📊 Comparing: ${stream1.studentId} vs ${stream2.studentId}`);

        const result = this.computePearsonCorrelation(
          stream1.rssiData,
          stream2.rssiData
        );

        if (result.correlation !== null) {
          const severity = this.determineSeverity(result.correlation);
          const suspicious = this.isSuspicious(result.correlation);

          const analysis = {
            student1: stream1.studentId,
            student2: stream2.studentId,
            correlation: result.correlation,
            dataPoints: result.dataPoints,
            mean1: result.mean1,
            mean2: result.mean2,
            severity,
            suspicious
          };

          results.push(analysis);

          // Flag suspicious pairs
          if (suspicious) {
            console.log(`🚨 FLAGGED: Correlation ρ = ${result.correlation.toFixed(4)} (≥ 0.9)`);
            flaggedPairs.push(analysis);
          } else {
            console.log(`✅ Normal: Correlation ρ = ${result.correlation.toFixed(4)} (< 0.9)`);
          }
        }
      }
    }

    console.log(`\n📊 Analysis complete: ${results.length} pairs analyzed, ${flaggedPairs.length} flagged`);

    return {
      totalPairs: results.length,
      flaggedCount: flaggedPairs.length,
      allResults: results,
      flaggedPairs
    };
  }

  /**
   * Generate statistical summary of correlations
   */
  generateSummary(results) {
    if (results.length === 0) {
      return {
        count: 0,
        mean: 0,
        max: 0,
        min: 0,
        flagged: 0
      };
    }

    const correlations = results.map(r => r.correlation);
    const mean = this.calculateMean(correlations);
    const max = Math.max(...correlations);
    const min = Math.min(...correlations);
    const flagged = results.filter(r => r.suspicious).length;

    return {
      count: results.length,
      mean: mean.toFixed(4),
      max: max.toFixed(4),
      min: min.toFixed(4),
      flagged,
      flaggedPercentage: ((flagged / results.length) * 100).toFixed(1)
    };
  }
}

module.exports = new CorrelationService();
