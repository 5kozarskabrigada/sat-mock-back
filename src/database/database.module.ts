import { Module, Global } from '@nestjs/common';
import { Pool } from 'pg';

// Global database connection pool - optimized for concurrent requests
@Global()
@Module({
  providers: [
    {
      provide: 'DATABASE_POOL',
      useFactory: () => {
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          // Optimized pool settings for concurrent operations
          max: 20, // Maximum number of clients in the pool
          idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
          connectionTimeoutMillis: 2000, // Return error after 2 seconds if no connection available
          // Enable SSL for Neon
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
