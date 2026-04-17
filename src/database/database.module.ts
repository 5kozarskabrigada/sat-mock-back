import { Module, Global } from '@nestjs/common';
import { Pool } from 'pg';

// Global database connection pool - optimized for concurrent requests
@Global()
@Module({
  providers: [
    {
      provide: 'DATABASE_POOL',
      useFactory: () => {
        const isProduction = process.env.NODE_ENV === 'production';
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          // Neon-friendly pool settings for bursty traffic and serverless networking.
          max: 15,
          min: 2,
          idleTimeoutMillis: 45000,
          connectionTimeoutMillis: 10000,
          keepAlive: true,
          allowExitOnIdle: false,
          maxUses: 7500,
          ssl: isProduction
            ? {
                rejectUnauthorized: false,
              }
            : false,
        });

        // Handle pool errors
        pool.on('error', (err) => {
          console.error('Unexpected database pool error', err);
        });

        return pool;
      },
    },
  ],
  exports: ['DATABASE_POOL'],
})
export class DatabaseModule {}
