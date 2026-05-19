import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { EmailService } from '../email/email.service';

@Injectable()
export class UsersService {
  constructor(
    @Inject('DATABASE_POOL') private pool: Pool,
    private emailService: EmailService,
  ) {}

  async findAll(filters?: { role?: string }) {
    let query = 'SELECT id, email, username, first_name, last_name, role, created_at, email_verified FROM users';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.role) {
      query += ` WHERE role = $${paramIndex}`;
      params.push(filters.role);
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async findOne(id: string) {
    const result = await this.pool.query(
      'SELECT id, email, username, first_name, last_name, role, created_at, email_verified FROM users WHERE id = $1',
      [id],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  async create(userData: {
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    password: string;
    role?: string;
    sendEmail?: boolean;
  }) {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const role = userData.role || 'student';

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, username, first_name, last_name, role, email_verified, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW()) 
         RETURNING id, email, username, first_name, last_name, role, created_at`,
        [userData.email, userData.username, userData.firstName, userData.lastName, role],
      );

      const user = userResult.rows[0];

      // Create Better Auth account entry
      await client.query(
        `INSERT INTO accounts (user_id, account_id, provider_id, password, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [user.id, userData.email, 'credential', hashedPassword],
      );

      await client.query('COMMIT');

      // Send welcome email if requested and email is not a placeholder
      if (userData.sendEmail && !userData.email.includes('@sat-platform.local')) {
        try {
          await this.emailService.sendWelcomeEmail(userData.email, {
            firstName: userData.firstName,
            lastName: userData.lastName,
            username: userData.username,
            password: userData.password,
          });
          console.log(`Welcome email sent to ${userData.email}`);
        } catch (emailError) {
          console.error('Failed to send welcome email:', emailError);
          // Don't fail the user creation if email fails
        }
      }

      return { user, password: userData.password };
    } catch (error) {
      await client.query('ROLLBACK');
      
      // Handle specific database errors
      if (error.code === '23505') { // Unique constraint violation
        if (error.constraint === 'users_email_key' || error.detail?.includes('email')) {
          throw new Error('This email address is already registered. Please use a different email.');
        }
        if (error.constraint === 'users_username_key' || error.detail?.includes('username')) {
          throw new Error('This username is already taken. Please try again.');
        }
        throw new Error('A user with this information already exists.');
      }
      
      throw error;
    } finally {
      client.release();
    }
  }

  async update(id: string, userData: any) {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (userData.firstName !== undefined) {
      fields.push(`first_name = $${paramIndex++}`);
      values.push(userData.firstName);
    }
    if (userData.lastName !== undefined) {
      fields.push(`last_name = $${paramIndex++}`);
      values.push(userData.lastName);
    }
    if (userData.username !== undefined) {
      fields.push(`username = $${paramIndex++}`);
      values.push(userData.username);
    }
    if (userData.role !== undefined) {
      fields.push(`role = $${paramIndex++}`);
      values.push(userData.role);
    }

    if (fields.length === 0) {
      return this.findOne(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update user info
      const userResult = await client.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex} 
         RETURNING id, email, username, first_name, last_name, role, created_at`,
        values,
      );

      // Update password if provided
      if (userData.password) {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        await client.query(
          `UPDATE accounts SET password = $1, updated_at = NOW() 
           WHERE user_id = $2 AND provider_id = 'credential'`,
          [hashedPassword, id],
        );
      }

      await client.query('COMMIT');
      return userResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(id: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Delete account first (foreign key constraint)
      await client.query('DELETE FROM accounts WHERE user_id = $1', [id]);

      // Delete user
      const result = await client.query(
        'DELETE FROM users WHERE id = $1 RETURNING id, email',
        [id],
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
