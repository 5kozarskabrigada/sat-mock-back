import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

// Load environment variables
config();

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    console.log('🔄 Connecting to database...');
    const client = await pool.connect();
    console.log('✅ Connected to database');

    // Read the SQL migration file
    const migrationsPath = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsPath).filter(f => f.endsWith('.sql')).sort();
    
    console.log('📋 Found migrations:');
    files.forEach(f => console.log(`  - ${f}`));
    
    for (const file of files) {
      console.log(`\n🔄 Running: ${file}`);
      const migrationSQL = fs.readFileSync(path.join(migrationsPath, file), 'utf-8');
      
      try {
        await client.query(migrationSQL);
        console.log(`✅ ${file} completed`);
      } catch (error: any) {
        console.error(`❌ ${file} failed:`, error.message);
        // Continue with next migration even if one fails
      }
    }

    // Verify tables were created
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log('\n📋 Tables in database:');
    result.rows.forEach((row) => {
      console.log(`  - ${row.table_name}`);
    });

    client.release();
    await pool.end();
    
    console.log('\n✅ Database migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
