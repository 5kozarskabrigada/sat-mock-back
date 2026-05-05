import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';

/**
 * Lightweight middleware that logs per-request usage attributed to the
 * authenticated user. Fires AFTER response is sent so it never blocks.
 */
@Injectable()
export class UsageTrackerMiddleware implements NestMiddleware {
  constructor(@Inject('DATABASE_POOL') private pool: Pool) {}

  private warned = false;

  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();

    res.on('finish', async () => {
      const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

      const userId = (req as any).user?.id || null;
      if (!userId) return; // skip anonymous requests

      const userRole = (req as any).user?.role || 'unknown';
      const method = req.method;
      const rawPath = req.originalUrl?.split('?')[0] || req.url;
      const path = rawPath.replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        ':id',
      );

      try {
        await this.pool.query(
          `INSERT INTO request_usage (user_id, user_role, method, path, status_code, response_time_ms)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, userRole, method, path, res.statusCode, Math.round(elapsedMs)],
        );
      } catch (err: any) {
        if (!this.warned) {
          console.warn('[usageTracker] Failed to log usage:', err.message);
          this.warned = true;
        }
      }
    });

    next();
  }
}
