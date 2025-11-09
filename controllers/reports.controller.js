/**
 * 📈 Reports Controller
 *
 * Provides reporting endpoints such as attendance correlation summaries.
 */

const RSSIStream = require('../models/RSSIStream');
const correlationService = require('../services/correlation.service');

/**
 * GET /api/reports/attendance-correlation
 * Query params:
 * - date=YYYY-MM-DD (optional; default: last 24h)
 * - classId=CS101 (optional; restrict to one class)
 * - minReadings=10 (optional; minimum readings per stream)
 * - limit=50 (optional; max flagged pairs per session in response)
 */
exports.getAttendanceCorrelationReport = async (req, res) => {
  try {
    const { date, classId } = req.query;
    const minReadings = parseInt(req.query.minReadings || '10', 10);
    const flaggedLimit = parseInt(req.query.limit || '50', 10);

    // Build base query
    const query = { totalReadings: { $gte: minReadings } };

    let rangeInfo = 'last_24h';
    if (classId) query.classId = classId;

    if (date) {
      const day = new Date(date);
      if (isNaN(day.getTime())) {
        return res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD' });
      }
      day.setHours(0, 0, 0, 0);
      const endDay = new Date(day);
      endDay.setHours(23, 59, 59, 999);
      query.sessionDate = { $gte: day, $lte: endDay };
      rangeInfo = day.toISOString().split('T')[0];
    } else {
      const last24h = new Date();
      last24h.setHours(last24h.getHours() - 24);
      query.sessionDate = { $gte: last24h };
    }

    // Fetch streams
    const streams = await RSSIStream
      .find(query)
      .select('studentId classId sessionDate rssiData totalReadings')
      .lean();

    if (streams.length === 0) {
      return res.status(200).json({
        date: rangeInfo,
        classId: classId || null,
        sessionsAnalyzed: 0,
        totalPairs: 0,
        totalFlagged: 0,
        sessions: []
      });
    }

    // Group by (classId + sessionDate: day)
    const sessions = {};
    for (const s of streams) {
      const d = new Date(s.sessionDate);
      d.setHours(0, 0, 0, 0);
      const dStr = d.toISOString().split('T')[0];
      const key = `${s.classId}|${dStr}`;
      if (!sessions[key]) sessions[key] = [];
      sessions[key].push(s);
    }

    let totalPairs = 0;
    let totalFlagged = 0;
    const sessionResults = [];

    for (const [key, list] of Object.entries(sessions)) {
      const [cls, dStr] = key.split('|');

      if (list.length < 2) {
        sessionResults.push({
          classId: cls,
          sessionDate: dStr,
          students: list.length,
          pairs: 0,
          flagged: 0,
          summary: { count: 0, mean: 0, min: 0, max: 0, flagged: 0, flaggedPercentage: '0.0' },
          flaggedPairs: []
        });
        continue;
      }

      const analysis = correlationService.analyzeAllPairs(list);
      const summary = correlationService.generateSummary(analysis.allResults);

      totalPairs += analysis.totalPairs;
      totalFlagged += analysis.flaggedCount;

      // Limit flagged pairs to keep payload small
      const flaggedPairsLimited = analysis.flaggedPairs
        .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
        .slice(0, flaggedLimit);

      sessionResults.push({
        classId: cls,
        sessionDate: dStr,
        students: list.length,
        pairs: analysis.totalPairs,
        flagged: analysis.flaggedCount,
        summary,
        flaggedPairs: flaggedPairsLimited
      });
    }

    // Sort sessions by flagged desc, then pairs desc
    sessionResults.sort((a, b) => (b.flagged - a.flagged) || (b.pairs - a.pairs));

    return res.status(200).json({
      date: rangeInfo,
      classId: classId || null,
      sessionsAnalyzed: sessionResults.length,
      totalPairs,
      totalFlagged,
      sessions: sessionResults
    });

  } catch (error) {
    console.error('❌ Attendance correlation report error:', error);
    return res.status(500).json({ error: 'Failed to generate correlation report', details: error.message });
  }
};
