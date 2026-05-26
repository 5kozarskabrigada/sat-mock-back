import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class ActivityLogsService {
  constructor(@Inject('DATABASE_POOL') private pool: Pool) {}

  async create(logData: { userId: string; studentExamId?: string; examId?: string; type: string; details?: string }) {
    const result = await this.pool.query(
      `INSERT INTO activity_logs (user_id, student_exam_id, exam_id, type, details, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [logData.userId, logData.studentExamId, logData.examId, logData.type, logData.details],
    );

    return result.rows[0];
  }

  async findAll(filters?: { userId?: string; examId?: string; type?: string }) {
    let query = `
      SELECT al.*, 
             u.email as user_email,
             e.title as exam_title
      FROM activity_logs al
      JOIN users u ON al.user_id = u.id
      LEFT JOIN exams e ON al.exam_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.userId) {
      query += ` AND al.user_id = $${paramIndex}`;
      params.push(filters.userId);
      paramIndex++;
    }

    if (filters?.examId) {
      query += ` AND al.exam_id = $${paramIndex}`;
      params.push(filters.examId);
      paramIndex++;
    }

    if (filters?.type) {
      query += ` AND al.type = $${paramIndex}`;
      params.push(filters.type);
      paramIndex++;
    }

    query += ' ORDER BY al.created_at DESC';

    const result = await this.pool.query(query, params);
    return result.rows;
  }
}
