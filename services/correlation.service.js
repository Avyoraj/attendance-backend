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

    // 3. Calculate means and standard deviations
    const mean1 = this.calculateMean(aligned1);
    const mean2 = this.calculateMean(aligned2);
    const stdDev1 = this.calculateStdDev(aligned1, mean1);
    const stdDev2 = this.calculateStdDev(aligned2, mean2);

    // 4. Calculate Pearson correlation
    const correlation = this.pearsonFormula(aligned1, aligned2, mean1, mean2);

    // 5. Check for stationary proxy (desk scenario)
    // If both signals are flat AND close together, it's suspicious
    const stationaryCheck = this.checkStationaryProxy(aligned1, aligned2, mean1, mean2, stdDev1, stdDev2);

    console.log(`📊 Correlation computed: ρ = ${correlation.toFixed(4)} (${aligned1.length} data points)`);
    if (stationaryCheck.isStationary) {
      console.log(`🪑 Stationary detection: both devices stable, mean diff = ${stationaryCheck.meanDifference.toFixed(2)} dBm`);
    }

    return {
      correlation,
      dataPoints: aligned1.length,
      mean1: mean1.toFixed(2),
      mean2: mean2.toFixed(2),
      stdDev1: stdDev1.toFixed(2),
      stdDev2: stdDev2.toFixed(2),
      aligned1,
      aligned2,
      commonTimestamps: timestamps,
      stationaryCheck
    };
  }

  /**
   * Check for stationary proxy scenario (devices sitting on desk together)
   * Detects when correlation is low BUT both devices have:
   * - Low variance (stationary/stable)
   * - Similar average RSSI (same location)
   */
  checkStationaryProxy(data1, data2, mean1, mean2, stdDev1, stdDev2) {
    const STATIONARY_THRESHOLD = 3;    // StdDev below this = stationary
    const MEAN_DIFF_THRESHOLD = 5;     // If means within 5 dBm = same location
    
    const isStationary1 = stdDev1 < STATIONARY_THRESHOLD;
    const isStationary2 = stdDev2 < STATIONARY_THRESHOLD;
    const meanDifference = Math.abs(mean1 - mean2);
    const isSameLocation = meanDifference <= MEAN_DIFF_THRESHOLD;
    
    const isStationary = isStationary1 && isStationary2;
    const isSuspiciousStationary = isStationary && isSameLocation;
    
    return {
      isStationary,
      isStationary1,
      isStationary2,
      meanDifference,
      isSameLocation,
      isSuspiciousStationary,
      reason: isSuspiciousStationary 
        ? 'Both devices stationary at same location (desk scenario)' 
        : null
    };
  }

  /**
   * Calculate standard deviation
   */
  calculateStdDev(data, mean) {
    if (data.length === 0) return 0;
    const squaredDiffs = data.map(val => Math.pow(val - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / data.length;
    return Math.sqrt(avgSquaredDiff);
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

    const times1 = Array.from(map1.keys()).sort((a, b) => a - b);
    const times2 = Array.from(map2.keys()).sort((a, b) => a - b);

    // Match timestamps within tolerance window using two-pointer approach
    // This ensures 1-to-1 matching (no data duplication)
    let ptr2 = 0;

    for (const t1 of times1) {
      // Advance ptr2 to the first potential match (t2 >= t1 - tolerance)
      while (ptr2 < times2.length && times2[ptr2] < t1 - tolerance) {
        ptr2++;
      }

      // Check if we ran out of data in times2
      if (ptr2 >= times2.length) break;

      const t2 = times2[ptr2];

      // Check if t2 is within valid range (t2 <= t1 + tolerance)
      if (t2 <= t1 + tolerance) {
        aligned1.push(map1.get(t1));
        aligned2.push(map2.get(t2));
        timestamps.push(new Date(t1));
        
        // Move pointer to prevent reusing this t2 (1-to-1 matching)
        ptr2++;
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
   * Now includes stationary detection for the "desk scenario"
   * 
   * @param {Number} correlation - Pearson correlation coefficient
   * @param {Object} stationaryCheck - Result from checkStationaryProxy
   * @returns {Object} { suspicious, reason }
   */
  isSuspicious(correlation, stationaryCheck = null) {
    // High correlation = moving together
    if (Math.abs(correlation) >= 0.9) {
      return {
        suspicious: true,
        reason: 'high_correlation',
        description: `High correlation (ρ = ${correlation.toFixed(4)}) - devices moving together`
      };
    }
    
    // Stationary proxy detection (desk scenario)
    if (stationaryCheck && stationaryCheck.isSuspiciousStationary) {
      return {
        suspicious: true,
        reason: 'stationary_proxy',
        description: `Stationary proxy detected - both devices stable at same location (mean diff: ${stationaryCheck.meanDifference.toFixed(2)} dBm)`
      };
    }
    
    return {
      suspicious: false,
      reason: 'normal',
      description: 'No proxy indicators detected'
    };
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
          const suspiciousResult = this.isSuspicious(result.correlation, result.stationaryCheck);

          const analysis = {
            student1: stream1.studentId,
            student2: stream2.studentId,
            correlation: result.correlation,
            dataPoints: result.dataPoints,
            mean1: result.mean1,
            mean2: result.mean2,
            stdDev1: result.stdDev1,
            stdDev2: result.stdDev2,
            severity,
            suspicious: suspiciousResult.suspicious,
            suspiciousReason: suspiciousResult.reason,
            suspiciousDescription: suspiciousResult.description,
            stationaryCheck: result.stationaryCheck
          };

          results.push(analysis);

          // Flag suspicious pairs
          if (suspiciousResult.suspicious) {
            console.log(`🚨 FLAGGED: ${suspiciousResult.description}`);
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
