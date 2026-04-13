import { Pool } from 'pg';
import { config } from 'dotenv';

config();

async function checkData() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    const client = await pool.connect();
    
    // Count rows in each table
    const tables = ['users', 'accounts', 'exams', 'questions', 'student_exams', 'student_answers', 'activity_logs', 'classrooms'];
    
    console.log('\n📊 Row counts:');
    for (const table of tables) {
      try {
        const result = await client.query(`SELECT COUNT(*) FROM "${table}"`);
        console.log(`  ${table}: ${result.rows[0].count} rows`);
      } catch (error) {
        console.log(`  ${table}: Table not found or error`);
      }
    }

    client.release();
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkData();
