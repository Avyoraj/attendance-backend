/**
 * 🚨 Anomaly Detection Service (Supabase)
 *
 * Supabase-backed anomaly CRUD/upsert helpers used by controllers.
 * Normalizes student pairs to avoid duplicates and stores correlation metadata.
 */

const { supabaseAdmin } = require('../utils/supabase');

class AnomalyService {
  async createAnomaly({ classId, sessionDate, flaggedUsers, correlationScore, severity, metadata = {} }) {
    const [s1, s2] = [...flaggedUsers].sort();
    const sessionDateStr = sessionDate instanceof Date ? sessionDate.toISOString().split('T')[0] : sessionDate;

    const existing = await this.findExistingAnomaly(classId, sessionDateStr, [s1, s2]);

    if (existing) {
      if (correlationScore > (existing.correlation_score ?? -1)) {
        await supabaseAdmin
          .from('anomalies')
          .update({
            correlation_score: correlationScore,
            severity: severity === 'critical' ? 'critical' : severity || existing.severity,
            status: 'pending',
            notes: metadata?.notes || existing.notes || null,
          })
          .eq('id', existing.id);
      }
      return existing;
    }

    const { data, error } = await supabaseAdmin
      .from('anomalies')
      .insert({
        class_id: classId,
        session_date: sessionDateStr,
        student_id_1: s1,
        student_id_2: s2,
        correlation_score: correlationScore,
        severity: severity === 'critical' ? 'critical' : severity || 'warning',
        status: 'pending',
        notes: metadata?.notes || null,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  async findExistingAnomaly(classId, sessionDate, flaggedUsers) {
    const [s1, s2] = [...flaggedUsers].sort();
    const sessionDateStr = sessionDate instanceof Date ? sessionDate.toISOString().split('T')[0] : sessionDate;

    const { data, error } = await supabaseAdmin
      .from('anomalies')
      .select('*')
      .eq('class_id', classId)
      .eq('session_date', sessionDateStr)
      .or(`and(student_id_1.eq.${s1},student_id_2.eq.${s2}),and(student_id_1.eq.${s2},student_id_2.eq.${s1})`)
      .limit(1);

    if (error) {
      console.error('❌ findExistingAnomaly error:', error);
      return null;
    }

    return data?.[0] || null;
  }

  async processAnalysisResults(classId, sessionDate, analysisResults) {
    const { flaggedPairs = [] } = analysisResults || {};
    const createdAnomalies = [];

    for (const pair of flaggedPairs) {
      try {
        const anomaly = await this.createAnomaly({
          classId,
          sessionDate,
          flaggedUsers: [pair.student1, pair.student2],
          correlationScore: pair.correlation,
          severity: pair.severity,
          metadata: { notes: pair.notes || null },
        });
        createdAnomalies.push(anomaly);
      } catch (error) {
        console.error(`❌ Error processing pair ${pair.student1} & ${pair.student2}:`, error);
      }
    }

    return createdAnomalies;
  }

  async getAnomalies({ classId, sessionDate, status, limit = 100 }) {
    let query = supabaseAdmin.from('anomalies').select('*');

    if (classId) query = query.eq('class_id', classId);
    if (status) query = query.eq('status', status);
    if (sessionDate) {
      const sessionDateStr = sessionDate instanceof Date ? sessionDate.toISOString().split('T')[0] : sessionDate;
      query = query.eq('session_date', sessionDateStr);
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  }

  async updateAnomalyStatus(anomalyId, status, reviewedBy, reviewNotes) {
    const updates = {
      status,
      reviewed_at: new Date().toISOString(),
      notes: reviewNotes || null,
    };

    const { data, error } = await supabaseAdmin
      .from('anomalies')
      .update(updates)
      .eq('id', anomalyId)
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Anomaly not found');
      }
      throw error;
    }

    return data;
  }

  async getStatistics({ classId, startDate, endDate }) {
    let query = supabaseAdmin.from('anomalies').select('id,status,session_date');
    if (classId) query = query.eq('class_id', classId);
    if (startDate)
      query = query.gte('session_date', startDate instanceof Date ? startDate.toISOString().split('T')[0] : startDate);
    if (endDate)
      query = query.lte('session_date', endDate instanceof Date ? endDate.toISOString().split('T')[0] : endDate);

    const { data, error } = await query.limit(1000);
    if (error) throw error;

    const counts = { total: 0, pending: 0, reviewed: 0, confirmed: 0, dismissed: 0 };
    for (const row of data || []) {
      counts.total += 1;
      if (row.status === 'pending') counts.pending += 1;
      if (row.status === 'reviewed') counts.reviewed += 1;
      if (row.status === 'confirmed' || row.status === 'confirmed_proxy') counts.confirmed += 1;
      if (row.status === 'dismissed' || row.status === 'false_positive') counts.dismissed += 1;
    }

    return counts;
  }

  async cleanupOldAnomalies(daysOld = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('anomalies')
      .delete()
      .in('status', ['reviewed', 'dismissed', 'false_positive'])
      .lt('session_date', cutoffStr)
      .select('id');

    if (error) throw error;
    return (data || []).length;
  }
}

module.exports = new AnomalyService();
