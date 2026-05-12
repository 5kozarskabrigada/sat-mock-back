#!/usr/bin/env ts-node

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';

config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech')
    ? { rejectUnauthorized: false }
    : undefined,
});

async function applyMigration() {
  console.log('🔄 Applying images table migration...\n');

  try {
    const migrationPath = join(__dirname, '../migrations/004_add_images_table.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📝 Running migration SQL...');
    await pool.query(migrationSQL);

    console.log('✅ Images table migration completed successfully!\n');
    console.log('📊 Table created: images');
    console.log('   - Stores image binary data (BYTEA)');
    console.log('   - Replaces Supabase Storage');
    console.log('   - Indexed for fast lookups\n');
    console.log('🎉 Migration complete! You can now upload images to Neon PostgreSQL.');

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigration();
