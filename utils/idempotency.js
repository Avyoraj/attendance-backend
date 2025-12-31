const crypto = require('crypto');
const { supabaseAdmin } = require('./supabase');

const TABLE = 'idempotency_keys';

function stableHash(payload) {
  const json = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}

async function findKey(eventId, scope) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('event_id', eventId)
    .eq('scope', scope)
    .single();

  if (error) return null;
  return data;
}

async function persistKey({ eventId, scope, requestHash, response, statusCode }) {
  const payload = {
    event_id: eventId,
    scope,
    request_hash: requestHash,
    response: response ? JSON.parse(JSON.stringify(response)) : null,
    status_code: statusCode || 200,
  };

  // Upsert on (event_id, scope)
  await supabaseAdmin.from(TABLE).upsert(payload, { onConflict: 'event_id,scope' });
}

module.exports = {
  stableHash,
  findKey,
  persistKey,
};
