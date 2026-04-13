import { Pool } from 'pg';
import { config } from 'dotenv';

config();

async function checkDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    console.log('🔄 Connecting to database...');
    const client = await pool.connect();
    console.log('✅ Connected\n');

    // Get all tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log('📋 Existing tables:');
    tables.rows.forEach((row) => {
      console.log(`  - ${row.table_name}`);
    });

    // Check specific tables for columns
    const importantTables = ['user', 'exams', 'questions', 'student_exams'];
    
    for (const tableName of importantTables) {
      const tableExists = tables.rows.find(r => r.table_name === tableName);
      if (tableExists) {
        const columns = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = $1
          ORDER BY ordinal_position;
        `, [tableName]);
        
        console.log(`\n📊 Columns in '${tableName}':`);
        columns.rows.forEach(col => {
          console.log(`  - ${col.column_name}: ${col.data_type}`);
        });
      }
    }

    client.release();
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkDatabase();
