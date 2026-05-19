import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false,
  } : false,
});

async function createJamalAdmin() {
  console.log('🔍 Checking if user "jamal" already exists...');

  try {
    // Check if user already exists
    const existingUser = await pool.query(
      `SELECT id, email, username, role FROM users WHERE username = 'jamal' OR email = 'jamal@examroomedu.com'`
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];
      console.log('⚠️  User "jamal" already exists:');
      console.log('   ID:', user.id);
      console.log('   Email:', user.email);
      console.log('   Username:', user.username);
      console.log('   Role:', user.role);
      await pool.end();
      return;
    }

    console.log('📝 Creating admin user "jamal"...');

    const email = 'jamal@examroomedu.com';
    const username = 'jamal';
    const password = 'Jamal@2026';
    const firstName = 'Jamal';
    const lastName = 'Admin';

    const hashedPassword = await bcrypt.hash(password, 10);

    // Start transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, username, first_name, last_name, role, email_verified, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'admin', NOW(), NOW(), NOW())
         RETURNING id, email, username, first_name, last_name, role`,
        [email, username, firstName, lastName]
      );

      const user = userResult.rows[0];

      // Create account entry for password authentication
      await client.query(
        `INSERT INTO accounts (user_id, account_id, provider_id, password, created_at, updated_at)
         VALUES ($1, $2, 'credential', $3, NOW(), NOW())`,
        [user.id, email, hashedPassword]
      );

      await client.query('COMMIT');

      console.log('');
      console.log('✅ Admin user "jamal" created successfully!');
      console.log('');
      console.log('═══════════════════════════════════════');
      console.log('📧 Login Credentials:');
      console.log('═══════════════════════════════════════');
      console.log('Username: jamal');
      console.log('Email:    jamal@examroomedu.com');
      console.log('Password: Jamal@2026');
      console.log('Role:     admin');
      console.log('═══════════════════════════════════════');
      console.log('');
      console.log('⚠️  Please change the password after first login!');
      console.log('');

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error creating user:', error);
      throw error;
    } finally {
      client.release();
    }

    await pool.end();
    console.log('✅ Done!');

  } catch (error) {
    console.error('❌ Fatal error:', error);
    await pool.end();
    process.exit(1);
  }
}

createJamalAdmin();
