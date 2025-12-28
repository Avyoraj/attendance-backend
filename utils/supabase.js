const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;

// New key structure: sb_publishable_... and sb_secret_...
// Falls back to legacy keys for backward compatibility during transition
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env');
}

// Public client (respects RLS) - uses publishable key
const supabase = createClient(supabaseUrl, supabasePublishableKey);

// Admin client (bypasses RLS) - uses secret key for backend operations
const supabaseAdmin = supabaseSecretKey 
  ? createClient(supabaseUrl, supabaseSecretKey)
  : supabase;

module.exports = { supabase, supabaseAdmin };
