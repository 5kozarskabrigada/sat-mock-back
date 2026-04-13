import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class ExamsService {
  constructor(@Inject('DATABASE_POOL') private pool: Pool) {}

  async findAll(filters?: { status?: string; classroomId?: string }) {
    let query = `
      SELECT e.*, 
             u.email as creator_email,
             c.name as classroom_name,
             COUNT(DISTINCT q.id) as question_count
      FROM exams e
      LEFT JOIN users u ON e.created_by = u.id
      LEFT JOIN classrooms c ON e.classroom_id = c.id
      LEFT JOIN questions q ON e.id = q.exam_id AND q.deleted_at IS NULL
      WHERE e.deleted_at IS NULL
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      query += ` AND e.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters?.classroomId) {
      query += ` AND e.classroom_id = $${paramIndex}`;
      params.push(filters.classroomId);
      paramIndex++;
    }

    query += ' GROUP BY e.id, u.email, c.name ORDER BY e.created_at DESC';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async findOne(id: string) {
    const result = await this.pool.query(
      `SELECT e.*, 
              u.email as creator_email,
              c.name as classroom_name
       FROM exams e
       LEFT JOIN users u ON e.created_by = u.id
       LEFT JOIN classrooms c ON e.classroom_id = c.id
       WHERE e.id = $1 AND e.deleted_at IS NULL`,
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Exam with ID ${id} not found`);
    }

    return result.rows[0];
  }

  async create(examData: any, createdBy: string) {
    const result = await this.pool.query(
      `INSERT INTO exams (title, description, code, status, classroom_id, lockdown_policy, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        examData.title,
        examData.description,
        examData.code,
        examData.status || 'draft',
        examData.classroomId,
        examData.lockdownPolicy || 'log',
        createdBy,
      ],
    );

    return result.rows[0];
  }

  async update(id: string, examData: any) {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (examData.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(examData.title);
    }
    if (examData.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(examData.description);
    }
    if (examData.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(examData.status);
    }
    if (examData.code !== undefined) {
      fields.push(`code = $${paramIndex++}`);
      values.push(examData.code);
    }
    if (examData.lockdownPolicy !== undefined) {
      fields.push(`lockdown_policy = $${paramIndex++}`);
      values.push(examData.lockdownPolicy);
    }
    if (examData.classroomId !== undefined) {
      fields.push(`classroom_id = $${paramIndex++}`);
      values.push(examData.classroomId);
    }

    values.push(id);

    const result = await this.pool.query(
      `UPDATE exams SET ${fields.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Exam with ID ${id} not found`);
    }

    return result.rows[0];
  }

  async softDelete(id: string) {
    const result = await this.pool.query(
      'UPDATE exams SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *',
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Exam with ID ${id} not found`);
    }

    return result.rows[0];
  }

  async restore(id: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'UPDATE questions SET deleted_at = NULL WHERE exam_id = $1',
        [id],
      );

      const result = await client.query(
        'UPDATE exams SET deleted_at = NULL WHERE id = $1 RETURNING *',
        [id],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Exam with ID ${id} not found`);
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async permanentlyDelete(id: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query('DELETE FROM questions WHERE exam_id = $1', [id]);

      const result = await client.query(
        'DELETE FROM exams WHERE id = $1 RETURNING *',
        [id],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Exam with ID ${id} not found`);
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getDeleted() {
    const result = await this.pool.query(
      `SELECT e.*, u.email as creator_email
       FROM exams e
       LEFT JOIN users u ON e.created_by = u.id
       WHERE e.deleted_at IS NOT NULL
       ORDER BY e.deleted_at DESC`,
    );

    return result.rows;
  }
}
