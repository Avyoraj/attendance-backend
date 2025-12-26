/**
 * Supabase Database Setup Script
 * Run with: node scripts/setup-supabase.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('🚀 Starting Supabase database setup...\n');

  // Read migration files
  const migrationsDir = path.join(__dirname, '../supabase/migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    
    console.log(`📄 Running ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    
    // Split by semicolons and run each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });
        if (error && !error.message.includes('already exists')) {
          console.log(`  ⚠️  ${error.message}`);
        }
      } catch (err) {
        // Supabase JS doesn't have direct SQL execution, need to use dashboard
        console.log(`  ℹ️  Statement needs manual execution in SQL Editor`);
      }
    }
    console.log(`  ✅ ${file} processed\n`);
  }

  console.log('✨ Setup complete!');
  console.log('\n📋 IMPORTANT: Run the SQL files manually in Supabase SQL Editor:');
  console.log('   1. Go to https://supabase.com/dashboard/project/xutqesrorqiztfkowdyh/sql');
  console.log('   2. Paste contents of 001_initial_schema.sql and run');
  console.log('   3. Paste contents of 002_seed_data.sql and run');
}

// Test connection
async function testConnection() {
  console.log('🔌 Testing Supabase connection...');
  
  const { data, error } = await supabase.from('rooms').select('count').limit(1);
  
  if (error && error.code === '42P01') {
    console.log('⚠️  Tables not created yet. Run migrations first.\n');
    return false;
  } else if (error) {
    console.log(`❌ Connection error: ${error.message}\n`);
    return false;
  }
  
  console.log('✅ Connected to Supabase!\n');
  return true;
}

async function main() {
  const connected = await testConnection();
  
  if (!connected) {
    console.log('📋 Please run the SQL migrations manually:');
    console.log('   1. Open: https://supabase.com/dashboard/project/xutqesrorqiztfkowdyh/sql');
    console.log('   2. Copy contents of: attendance-backend/supabase/migrations/001_initial_schema.sql');
    console.log('   3. Paste and click "Run"');
    console.log('   4. Copy contents of: attendance-backend/supabase/migrations/002_seed_data.sql');
    console.log('   5. Paste and click "Run"');
    console.log('\n   Then run this script again to verify.');
  } else {
    // Check if tables exist
    const { data: rooms } = await supabase.from('rooms').select('*');
    const { data: students } = await supabase.from('students').select('*');
    
    console.log(`📊 Database Status:`);
    console.log(`   Rooms: ${rooms?.length || 0}`);
    console.log(`   Students: ${students?.length || 0}`);
    
    if (!rooms?.length) {
      console.log('\n⚠️  No seed data found. Run 002_seed_data.sql in SQL Editor.');
    }
  }
}

main().catch(console.error);
