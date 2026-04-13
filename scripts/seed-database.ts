import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { config } from 'dotenv';

config();

async function seedAdmin() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    console.log('🔄 Connecting to database...');
    const client = await pool.connect();
    console.log('✅ Connected');

    // Admin credentials
    const adminEmail = 'admin@satmock.com';
    const adminPassword = 'admin123'; // Change this in production!
    const adminId = randomBytes(16).toString('hex');
    const accountId = randomBytes(16).toString('hex');

    console.log('\n🔄 Creating admin user...');

    // Check if admin already exists
    const existingUser = await client.query(
      'SELECT id FROM "user" WHERE email = $1',
      [adminEmail]
    );

    if (existingUser.rows.length > 0) {
      console.log('⚠️  Admin user already exists');
      client.release();
      await pool.end();
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Create user
    await client.query(
      `INSERT INTO "user" (id, email, email_verified, name, role, first_name, last_name, username)
       VALUES ($1, $2, true, $3, $4, $5, $6, $7)`,
      [adminId, adminEmail, 'Admin User', 'admin', 'Admin', 'User', 'admin']
    );

    // Create account (password auth)
    await client.query(
      `INSERT INTO account (id, user_id, account_id, provided_id, password)
       VALUES ($1, $2, $3, $4, $5)`,
      [accountId, adminId, 'credential', adminEmail, hashedPassword]
    );

    console.log('✅ Admin user created successfully!');
    console.log('\n📧 Email:', adminEmail);
    console.log('🔑 Password:', adminPassword);
    console.log('\n⚠️  CHANGE THE PASSWORD IN PRODUCTION!');

    client.release();
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

seedAdmin();
