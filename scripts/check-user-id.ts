import { Pool } from 'pg';
import { config } from 'dotenv';

config();

async function checkUserIdType() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    const client = await pool.connect();
    
    const result = await client.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'id'
    `);
    
    console.log('users.id type:', result.rows[0].data_type);
    console.log('UDT name:', result.rows[0].udt_name);
    
    client.release();
    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error('Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkUserIdType();
