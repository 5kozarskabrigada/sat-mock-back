import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @Inject('DATABASE_POOL') private pool: Pool,
    private jwtService: JwtService,
  ) {}

  async validateUser(identifier: string, password: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT id, email, username, first_name, last_name, role, password_hash
       FROM users
       WHERE email = $1 OR username = $1`,
      [identifier],
    );

    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check password with Better Auth account table
    const accountResult = await this.pool.query(
      'SELECT password FROM accounts WHERE user_id = $1 AND provider_id = $2',
      [user.id, 'credential'],
    );

    const account = accountResult.rows[0];
    if (!account || !account.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, account.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { password_hash, ...result_user } = user;
    return result_user;
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async register(email: string, password: string, role: string = 'student') {
    const hashedPassword = await bcrypt.hash(password, 10);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, role, created_at) 
         VALUES ($1, $2, NOW()) 
         RETURNING id, email, role`,
        [email, role],
      );

      const user = userResult.rows[0];

      // Create Better Auth account entry
      await client.query(
        `INSERT INTO accounts (user_id, account_id, provider_id, password, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [user.id, email, 'credential', hashedPassword],
      );

      await client.query('COMMIT');
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
