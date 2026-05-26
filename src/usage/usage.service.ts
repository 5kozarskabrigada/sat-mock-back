import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class UsageService {
  constructor(@Inject('DATABASE_POOL') private pool: Pool) {}

  /**
   * Get per-user usage stats for cost attribution.
   */
  async getPerStudentUsage(from?: string, to?: string) {
    const now = new Date();
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();
    const fromDate = from || startOfMonth;
    const rawTo = to || now.toISOString();
    const toDate = rawTo.length === 10 ? `${rawTo}T23:59:59.999Z` : rawTo;

    const { rows } = await this.pool.query(
      `SELECT
          ru.user_id, ru.user_role,
          u.first_name, u.last_name, u.username, u.email,
          COUNT(*)::int AS total_requests,
          SUM(ru.response_time_ms)::bigint AS total_response_ms,
          ROUND(SUM(ru.response_time_ms) / 1000.0, 2) AS total_response_sec,
          COUNT(DISTINCT DATE(ru.created_at))::int AS active_days,
          MIN(ru.created_at) AS first_request,
          MAX(ru.created_at) AS last_request
       FROM request_usage ru
       JOIN users u ON u.id = ru.user_id
       WHERE ru.created_at >= $1 AND ru.created_at <= $2
       GROUP BY ru.user_id, u.first_name, u.last_name, u.username, u.email, ru.user_role
       ORDER BY total_response_ms DESC NULLS LAST`,
      [fromDate, toDate],
    );

    const totalMs = rows.reduce(
      (sum, r) => sum + Number(r.total_response_ms || 0),
      0,
    );
    const totalRequests = rows.reduce((sum, r) => sum + r.total_requests, 0);

    const users = rows.map((r) => ({
      ...r,
      pct_of_total_time:
        totalMs > 0
          ? Math.round((Number(r.total_response_ms) / totalMs) * 10000) / 100
          : 0,
      pct_of_total_requests:
        totalRequests > 0
          ? Math.round((r.total_requests / totalRequests) * 10000) / 100
          : 0,
    }));

    const studentCount = users.filter((u) => u.user_role === 'student').length;
    const adminCount = users.filter((u) => u.user_role === 'admin').length;
    const studentMs = users
      .filter((u) => u.user_role === 'student')
      .reduce((sum, r) => sum + Number(r.total_response_ms || 0), 0);
    const adminMs = users
      .filter((u) => u.user_role === 'admin')
      .reduce((sum, r) => sum + Number(r.total_response_ms || 0), 0);

    return {
      period: { from: fromDate, to: toDate },
      totals: {
        user_count: rows.length,
        student_count: studentCount,
        admin_count: adminCount,
        total_requests: totalRequests,
        total_response_ms: totalMs,
        total_response_sec: Math.round(totalMs / 10) / 100,
        student_response_ms: studentMs,
        admin_response_ms: adminMs,
      },
      users,
    };
  }

  /**
   * Get high-level usage summary.
   */
  async getUsageSummary(from?: string, to?: string) {
    const now = new Date();
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();
    const fromDate = from || startOfMonth;
    const rawTo = to || now.toISOString();
    const toDate = rawTo.length === 10 ? `${rawTo}T23:59:59.999Z` : rawTo;

    const [byRole, byPath, byDay] = await Promise.all([
      this.pool.query(
        `SELECT user_role, COUNT(*)::int AS requests, SUM(response_time_ms)::bigint AS total_ms
         FROM request_usage WHERE created_at >= $1 AND created_at <= $2
         GROUP BY user_role ORDER BY total_ms DESC`,
        [fromDate, toDate],
      ),
      this.pool.query(
        `SELECT path, COUNT(*)::int AS requests, SUM(response_time_ms)::bigint AS total_ms,
                ROUND(AVG(response_time_ms))::int AS avg_ms
         FROM request_usage WHERE created_at >= $1 AND created_at <= $2
         GROUP BY path ORDER BY total_ms DESC LIMIT 20`,
        [fromDate, toDate],
      ),
      this.pool.query(
        `SELECT DATE(created_at) AS day, COUNT(*)::int AS requests,
                COUNT(DISTINCT user_id)::int AS unique_users,
                SUM(response_time_ms)::bigint AS total_ms
         FROM request_usage WHERE created_at >= $1 AND created_at <= $2
         GROUP BY DATE(created_at) ORDER BY day`,
        [fromDate, toDate],
      ),
    ]);

    return {
      period: { from: fromDate, to: toDate },
      by_role: byRole.rows,
      top_endpoints: byPath.rows,
      by_day: byDay.rows,
    };
  }
}
