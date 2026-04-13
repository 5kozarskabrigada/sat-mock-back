import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class ClassroomsService {
  constructor(@Inject('DATABASE_POOL') private pool: Pool) {}

  async findAll() {
    const result = await this.pool.query(
      `SELECT c.*, 
              COUNT(DISTINCT sc.student_id) as student_count,
              COUNT(DISTINCT e.id) as exam_count
       FROM classrooms c
       LEFT JOIN student_classrooms sc ON c.id = sc.classroom_id
       LEFT JOIN exams e ON c.id = e.classroom_id AND e.deleted_at IS NULL
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
    );

    return result.rows;
  }

  async findOne(id: string) {
    const result = await this.pool.query(
      `SELECT c.*,
              COUNT(DISTINCT sc.student_id) as student_count
       FROM classrooms c
       LEFT JOIN student_classrooms sc ON c.id = sc.classroom_id
       WHERE c.id = $1
       GROUP BY c.id`,
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Classroom with ID ${id} not found`);
    }

    return result.rows[0];
  }

  async getStudents(classroomId: string) {
    const result = await this.pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, sc.joined_at
       FROM student_classrooms sc
       JOIN users u ON sc.student_id = u.id
       WHERE sc.classroom_id = $1
       ORDER BY sc.joined_at DESC`,
      [classroomId],
    );

    return result.rows;
  }

  async create(classroomData: any) {
    const result = await this.pool.query(
      'INSERT INTO classrooms (name, description, created_at) VALUES ($1, $2, NOW()) RETURNING *',
      [classroomData.name, classroomData.description],
    );

    return result.rows[0];
  }

  async update(id: string, classroomData: any) {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (classroomData.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(classroomData.name);
    }
    if (classroomData.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(classroomData.description);
    }

    values.push(id);

    const result = await this.pool.query(
      `UPDATE classrooms SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Classroom with ID ${id} not found`);
    }

    return result.rows[0];
  }

  async delete(id: string) {
    const result = await this.pool.query(
      'DELETE FROM classrooms WHERE id = $1 RETURNING *',
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Classroom with ID ${id} not found`);
    }

    return result.rows[0];
  }

  async addStudent(classroomId: string, studentId: string) {
    const result = await this.pool.query(
      `INSERT INTO student_classrooms (classroom_id, student_id, joined_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (student_id, classroom_id) DO NOTHING
       RETURNING *`,
      [classroomId, studentId],
    );

    return result.rows[0] || { message: 'Student already in classroom' };
  }

  async removeStudent(classroomId: string, studentId: string) {
    const result = await this.pool.query(
      'DELETE FROM student_classrooms WHERE classroom_id = $1 AND student_id = $2 RETURNING *',
      [classroomId, studentId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Student not in this classroom');
    }

    return result.rows[0];
  }
}
