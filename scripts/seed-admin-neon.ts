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

async function seedAdmin() {
  console.log('🔍 Checking for existing admin...');

  try {
    // Check if admin already exists
    const existingAdmin = await pool.query(
      `SELECT id, email, username, role FROM users WHERE role = 'admin' LIMIT 1`
    );

    if (existingAdmin.rows.length > 0) {
      const admin = existingAdmin.rows[0];
      console.log('✅ Admin already exists:');
      console.log('   ID:', admin.id);
      console.log('   Email:', admin.email);
      console.log('   Username:', admin.username || 'N/A');
      console.log('   Role:', admin.role);
      
      // Check if account entry exists
      const accountCheck = await pool.query(
        `SELECT * FROM accounts WHERE user_id = $1 AND provider_id = 'credential'`,
        [admin.id]
      );
      
      if (accountCheck.rows.length === 0) {
        console.log('⚠️  Warning: Admin user exists but no credential account found');
        console.log('   Creating account entry...');
        
        const defaultPassword = 'Admin@123456';
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        
        await pool.query(
          `INSERT INTO accounts (user_id, account_id, provider_id, password, created_at, updated_at)
           VALUES ($1, $2, 'credential', $3, NOW(), NOW())`,
          [admin.id, admin.email, hashedPassword]
        );
        
        console.log('✅ Account entry created');
        console.log('   Email:', admin.email);
        console.log('   Password:', defaultPassword);
        console.log('   ⚠️  PLEASE CHANGE THIS PASSWORD AFTER FIRST LOGIN');
      }
      
      await pool.end();
      return;
    }

    console.log('📝 Creating default admin user...');

    const email = 'admin@examroomedu.com';
    const password = 'Admin@123456';
    const username = 'admin';
    const firstName = 'System';
    const lastName = 'Administrator';

    const hashedPassword = await bcrypt.hash(password, 10);

    // Start transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, username, first_name, last_name, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'admin', 'active', NOW(), NOW())
         RETURNING id, email, username, role`,
        [email, username, firstName, lastName]
      );

      const user = userResult.rows[0];
      console.log('✅ User created:', user.id);

      // Create Better Auth account entry
      await client.query(
        `INSERT INTO accounts (user_id, account_id, provider_id, password, created_at, updated_at)
         VALUES ($1, $2, 'credential', $3, NOW(), NOW())`,
        [user.id, email, hashedPassword]
      );

      console.log('✅ Account entry created');

      await client.query('COMMIT');

      console.log('');
      console.log('========================================');
      console.log('✅ Admin user created successfully!');
      console.log('========================================');
      console.log('Email:', email);
      console.log('Username:', username);
      console.log('Password:', password);
      console.log('Role: admin');
      console.log('');
      console.log('⚠️  IMPORTANT: Change this password after first login!');
      console.log('========================================');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Error seeding admin:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the seed function
seedAdmin()
  .then(() => {
    console.log('✅ Seed completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  });
