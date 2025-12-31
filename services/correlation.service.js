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
    // 1. Align time series (match by timestamp or sliding window)
    const alignResult = this.alignTimeSeries(rssiData1, rssiData2);
    const { aligned1, aligned2, timestamps, method: alignmentMethod } = alignResult;

    // 2. Check if we have enough data points
    if (aligned1.length < 10) {
      console.warn(`⚠️ Insufficient data points for correlation: ${aligned1.length} (minimum: 10)`);
      return {
        correlation: null,
        reason: 'insufficient_data',
        dataPoints: aligned1.length,
        aligned1,
        aligned2,
        commonTimestamps: timestamps,
        alignmentMethod: alignmentMethod || 'unknown'
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

    console.log(`📊 Correlation computed: ρ = ${correlation.toFixed(4)} (${aligned1.length} data points, method: ${alignmentMethod || 'timestamp'})`);
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
      stationaryCheck,
      alignmentMethod: alignmentMethod || 'timestamp'
    };
  }

  /**
   * Check for stationary proxy scenario (devices sitting on desk together)
   * Detects when correlation is low BUT both devices have:
   * - Low variance (stationary/stable)
   * - Similar average RSSI (same location)
   */
  checkStationaryProxy(data1, data2, mean1, mean2, stdDev1, stdDev2) {
    const STATIONARY_THRESHOLD = 5;    // StdDev below this = stationary (increased from 3)
    const MEAN_DIFF_THRESHOLD = 8;     // If means within 8 dBm = same location (increased from 5)
    
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
      stdDev1,
      stdDev2,
      meanDifference,
      isSameLocation,
      isSuspiciousStationary,
      reason: isSuspiciousStationary 
        ? `Both devices stationary at same location (stdDev: ${stdDev1.toFixed(2)}, ${stdDev2.toFixed(2)}, mean diff: ${meanDifference.toFixed(2)} dBm)` 
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
   * Align two RSSI time series using SLIDING WINDOW approach
   * This works even when phones start at different times!
   * 
   * Strategy:
   * 1. First try timestamp-based alignment (if timestamps match well)
   * 2. If that fails, use sequence-based sliding window correlation
   * 
   * @param {Array} rssiData1 - [{timestamp: Date, rssi: Number}, ...]
   * @param {Array} rssiData2 - [{timestamp: Date, rssi: Number}, ...]
   * @returns {Object} { aligned1, aligned2, timestamps, method }
   */
  alignTimeSeries(rssiData1, rssiData2) {
    // First, try timestamp-based alignment
    const timestampResult = this.alignByTimestamp(rssiData1, rssiData2);
    
    // If we got enough aligned points (at least 10), use timestamp alignment
    if (timestampResult.aligned1.length >= 10) {
      console.log(`🔗 Timestamp alignment: ${timestampResult.aligned1.length} common points`);
      return { ...timestampResult, method: 'timestamp' };
    }
    
    // Otherwise, use sliding window sequence-based alignment
    console.log(`⚠️ Timestamp alignment failed (${timestampResult.aligned1.length} points), using sliding window...`);
    const slidingResult = this.alignBySlidingWindow(rssiData1, rssiData2);
    
    return { ...slidingResult, method: 'sliding_window' };
  }

  /**
   * Original timestamp-based alignment (with ±2 second tolerance)
   */
  alignByTimestamp(rssiData1, rssiData2) {
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

    const aligned1 = [];
    const aligned2 = [];
    const timestamps = [];
    const tolerance = 2000; // 2 seconds

    const times1 = Array.from(map1.keys()).sort((a, b) => a - b);
    const times2 = Array.from(map2.keys()).sort((a, b) => a - b);

    let ptr2 = 0;
    for (const t1 of times1) {
      while (ptr2 < times2.length && times2[ptr2] < t1 - tolerance) {
        ptr2++;
      }
      if (ptr2 >= times2.length) break;

      const t2 = times2[ptr2];
      if (t2 <= t1 + tolerance) {
        aligned1.push(map1.get(t1));
        aligned2.push(map2.get(t2));
        timestamps.push(new Date(t1));
        ptr2++;
      }
    }

    return { aligned1, aligned2, timestamps };
  }

  /**
   * Sliding window sequence-based alignment
   * Finds the best alignment between two RSSI sequences regardless of start time
   * 
   * How it works:
   * 1. Extract RSSI values as ordered sequences (sorted by timestamp)
   * 2. Slide the shorter sequence over the longer one
   * 3. At each position, compute correlation
   * 4. Return the alignment with highest correlation
   */
  alignBySlidingWindow(rssiData1, rssiData2) {
    // Sort by timestamp and extract RSSI values
    const sorted1 = [...rssiData1].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const sorted2 = [...rssiData2].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    const seq1 = sorted1.map(d => d.rssi);
    const seq2 = sorted2.map(d => d.rssi);
    
    console.log(`📊 Sliding window: seq1=${seq1.length} points, seq2=${seq2.length} points`);
    
    // Minimum window size for meaningful correlation
    const MIN_WINDOW = 10;
    
    if (seq1.length < MIN_WINDOW || seq2.length < MIN_WINDOW) {
      console.log(`⚠️ Sequences too short for sliding window (need ${MIN_WINDOW})`);
      return { aligned1: [], aligned2: [], timestamps: [] };
    }
    
    // Determine which is longer/shorter
    const [longer, shorter, longerSorted, shorterSorted] = seq1.length >= seq2.length 
      ? [seq1, seq2, sorted1, sorted2] 
      : [seq2, seq1, sorted2, sorted1];
    
    let bestCorrelation = -2; // Start below minimum possible (-1)
    let bestOffset = 0;
    let bestWindowSize = MIN_WINDOW;
    
    // Window size: use the shorter sequence length, but cap at reasonable size
    const windowSize = Math.min(shorter.length, longer.length, 60); // Max 60 points (~5 min at 5s intervals)
    
    // Slide the window across all possible positions
    const maxOffset = longer.length - windowSize + 1;
    
    console.log(`🔄 Testing ${maxOffset} window positions (window size: ${windowSize})`);
    
    for (let offset = 0; offset < maxOffset; offset++) {
      // Extract windows
      const window1 = longer.slice(offset, offset + windowSize);
      const window2 = shorter.slice(0, windowSize);
      
      // Quick correlation calculation
      const corr = this.quickCorrelation(window1, window2);
      
      if (corr !== null && corr > bestCorrelation) {
        bestCorrelation = corr;
        bestOffset = offset;
        bestWindowSize = windowSize;
      }
    }
    
    // Also try sliding shorter over longer (reverse direction)
    const maxOffset2 = shorter.length - windowSize + 1;
    for (let offset = 0; offset < maxOffset2; offset++) {
      const window1 = longer.slice(0, windowSize);
      const window2 = shorter.slice(offset, offset + windowSize);
      
      const corr = this.quickCorrelation(window1, window2);
      
      if (corr !== null && corr > bestCorrelation) {
        bestCorrelation = corr;
        bestOffset = -offset; // Negative to indicate reverse direction
        bestWindowSize = windowSize;
      }
    }
    
    console.log(`✅ Best alignment: offset=${bestOffset}, correlation=${bestCorrelation.toFixed(4)}`);
    
    // Extract the best aligned sequences
    let aligned1, aligned2, timestamps;
    
    if (bestOffset >= 0) {
      aligned1 = longer.slice(bestOffset, bestOffset + bestWindowSize);
      aligned2 = shorter.slice(0, bestWindowSize);
      timestamps = longerSorted.slice(bestOffset, bestOffset + bestWindowSize).map(d => new Date(d.timestamp));
    } else {
      aligned1 = longer.slice(0, bestWindowSize);
      aligned2 = shorter.slice(-bestOffset, -bestOffset + bestWindowSize);
      timestamps = longerSorted.slice(0, bestWindowSize).map(d => new Date(d.timestamp));
    }
    
    // Swap back if we swapped earlier
    if (seq1.length < seq2.length) {
      [aligned1, aligned2] = [aligned2, aligned1];
    }
    
    console.log(`🔗 Sliding window aligned ${aligned1.length} points (best corr: ${bestCorrelation.toFixed(4)})`);
    
    return { aligned1, aligned2, timestamps, slidingCorrelation: bestCorrelation };
  }

  /**
   * Quick correlation calculation for sliding window search
   * Simplified Pearson correlation without all the extra checks
   */
  quickCorrelation(data1, data2) {
    if (data1.length !== data2.length || data1.length < 5) return null;
    
    const n = data1.length;
    let sum1 = 0, sum2 = 0, sum1Sq = 0, sum2Sq = 0, pSum = 0;
    
    for (let i = 0; i < n; i++) {
      sum1 += data1[i];
      sum2 += data2[i];
      sum1Sq += data1[i] * data1[i];
      sum2Sq += data2[i] * data2[i];
      pSum += data1[i] * data2[i];
    }
    
    const num = pSum - (sum1 * sum2 / n);
    const den = Math.sqrt((sum1Sq - sum1 * sum1 / n) * (sum2Sq - sum2 * sum2 / n));
    
    if (den === 0) return 0;
    return num / den;
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
    // High correlation = moving together (lowered threshold from 0.9 to 0.85)
    if (Math.abs(correlation) >= 0.85) {
      // EXCEPTION: If mean difference is huge, they are likely far apart (e.g. two stationary students at opposite ends)
      // Two flat lines (stationary) will have correlation 1.0, but if they are 20dBm apart, they are not the same person.
      if (stationaryCheck && stationaryCheck.meanDifference > 15) {
        return {
          suspicious: false,
          reason: 'high_correlation_but_distant',
          description: `High correlation (ρ = ${correlation.toFixed(4)}) but large signal difference (${stationaryCheck.meanDifference.toFixed(2)} dBm) - likely distinct locations`
        };
      }

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
        description: `Stationary proxy detected - both devices stable at same location (mean diff: ${stationaryCheck.meanDifference.toFixed(2)} dBm, stdDev: ${stationaryCheck.stdDev1?.toFixed(2) || 'N/A'}, ${stationaryCheck.stdDev2?.toFixed(2) || 'N/A'})`
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
