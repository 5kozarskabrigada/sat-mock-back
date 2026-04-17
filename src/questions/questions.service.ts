import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class QuestionsService {
  constructor(@Inject('DATABASE_POOL') private pool: Pool) {}

  async findByExam(examId: string) {
    const result = await this.pool.query(
      `SELECT * FROM questions 
       WHERE exam_id = $1 AND deleted_at IS NULL 
       ORDER BY section, module, created_at`,
      [examId],
    );
    return result.rows;
  }

  async findOne(id: string) {
    const result = await this.pool.query(
      'SELECT * FROM questions WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }

    return result.rows[0];
  }

  async create(questionData: any) {
    const examId = questionData.exam_id ?? questionData.examId;
    const correctAnswer = questionData.correct_answer ?? questionData.correctAnswer;
    const equationLatex = questionData.equation_latex ?? questionData.equationLatex;

    if (!examId || !questionData.section || questionData.module === undefined || !questionData.content || !correctAnswer) {
      throw new BadRequestException('Missing required fields: exam_id/examId, section, module, content, correct_answer/correctAnswer');
    }

    const result = await this.pool.query(
      `INSERT INTO questions (exam_id, section, module, content, correct_answer, explanation, domain, equation_latex, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [
        examId,
        questionData.section,
        questionData.module,
        JSON.stringify(questionData.content),
        correctAnswer,
        questionData.explanation,
        questionData.domain,
        equationLatex,
      ],
    );

    return result.rows[0];
  }

  async createBulk(examId: string, questions: any[]) {
    if (!examId) {
      throw new BadRequestException('Missing required field: exam_id/examId');
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new BadRequestException('Questions array is required');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const createdQuestions: any[] = [];
      for (const q of questions) {
        const result = await client.query(
          `INSERT INTO questions (exam_id, section, module, content, correct_answer, explanation, domain, equation_latex, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           RETURNING *`,
          [
            examId,
            q.section,
            q.module,
            JSON.stringify(q.content),
            q.correct_answer ?? q.correctAnswer,
            q.explanation,
            q.domain,
            q.equation_latex ?? q.equationLatex,
          ],
        );
        createdQuestions.push(result.rows[0]);
      }

      await client.query('COMMIT');
      return createdQuestions;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(id: string, questionData: any) {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (questionData.section !== undefined) {
      fields.push(`section = $${paramIndex++}`);
      values.push(questionData.section);
    }
    if (questionData.module !== undefined) {
      fields.push(`module = $${paramIndex++}`);
      values.push(questionData.module);
    }

    if (questionData.content !== undefined) {
      fields.push(`content = $${paramIndex++}`);
      values.push(JSON.stringify(questionData.content));
    }
    const correctAnswer = questionData.correct_answer ?? questionData.correctAnswer;
    if (correctAnswer !== undefined) {
      fields.push(`correct_answer = $${paramIndex++}`);
      values.push(correctAnswer);
    }
    if (questionData.explanation !== undefined) {
      fields.push(`explanation = $${paramIndex++}`);
      values.push(questionData.explanation);
    }
    if (questionData.domain !== undefined) {
      fields.push(`domain = $${paramIndex++}`);
      values.push(questionData.domain);
    }
    const equationLatex = questionData.equation_latex ?? questionData.equationLatex;
    if (equationLatex !== undefined) {
      fields.push(`equation_latex = $${paramIndex++}`);
      values.push(equationLatex);
    }

    if (fields.length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    values.push(id);

    const result = await this.pool.query(
      `UPDATE questions SET ${fields.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }

    return result.rows[0];
  }

  async softDelete(id: string) {
    const result = await this.pool.query(
      'UPDATE questions SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *',
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }

    return result.rows[0];
  }

  async getDeleted() {
    const result = await this.pool.query(
      `SELECT q.*, e.title as exam_title
       FROM questions q
       LEFT JOIN exams e ON q.exam_id = e.id
       WHERE q.deleted_at IS NOT NULL
       ORDER BY q.deleted_at DESC`,
    );

    return result.rows;
  }

  async restore(id: string) {
    const result = await this.pool.query(
      'UPDATE questions SET deleted_at = NULL WHERE id = $1 RETURNING *',
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }

    return result.rows[0];
  }

  async permanentlyDelete(id: string) {
    const result = await this.pool.query(
      'DELETE FROM questions WHERE id = $1 RETURNING *',
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }

    return result.rows[0];
  }
}
