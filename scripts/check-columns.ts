import { Pool } from 'pg';
import { config } from 'dotenv';

config();

async function checkColumns() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    const client = await pool.connect();
    
    // Check classrooms columns
    const classrooms = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'classrooms'
      ORDER BY ordinal_position
    `);
    
    console.log('\nClassrooms columns:');
    classrooms.rows.forEach(row => console.log(`  - ${row.column_name}`));
    
    client.release();
    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error('Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkColumns();
