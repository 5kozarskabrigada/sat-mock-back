import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class StudentExamsService {
  constructor(@Inject('DATABASE_POOL') private pool: Pool) {}

  async startExam(studentId: string, examId: string) {
    // Check if exam exists and is active
    const examResult = await this.pool.query(
      'SELECT * FROM exams WHERE id = $1 AND status = $2 AND deleted_at IS NULL',
      [examId, 'active'],
    );

    if (examResult.rows.length === 0) {
      throw new NotFoundException('Exam not found or not active');
    }

    // Check if student already started this exam
    const existingResult = await this.pool.query(
      'SELECT * FROM student_exams WHERE student_id = $1 AND exam_id = $2',
      [studentId, examId],
    );

    if (existingResult.rows.length > 0) {
      return existingResult.rows[0];
    }

    // Start new exam attempt
    const result = await this.pool.query(
      `INSERT INTO student_exams (student_id, exam_id, status, started_at, created_at, updated_at)
       VALUES ($1, $2, 'in_progress', NOW(), NOW(), NOW())
       RETURNING *`,
      [studentId, examId],
    );

    return result.rows[0];
  }

  async getStudentExam(studentExamId: string, studentId: string | null) {
    const query = studentId
      ? `SELECT se.*, 
                e.title as exam_title,
                e.lockdown_policy
         FROM student_exams se
         JOIN exams e ON se.exam_id = e.id
         WHERE se.id = $1 AND se.student_id = $2`
      : `SELECT se.*, 
                e.title as exam_title,
                e.lockdown_policy
         FROM student_exams se
         JOIN exams e ON se.exam_id = e.id
         WHERE se.id = $1`;

    const params = studentId ? [studentExamId, studentId] : [studentExamId];
    const result = await this.pool.query(query, params);

    if (result.rows.length === 0) {
      throw new NotFoundException('Student exam not found');
    }

    return result.rows[0];
  }

  async getStudentAnswers(studentExamId: string) {
    const result = await this.pool.query(
      'SELECT * FROM student_answers WHERE student_exam_id = $1',
      [studentExamId],
    );

    return result.rows;
  }

  // OPTIMIZED: Upsert answer with transaction for concurrent autosave
  async saveAnswer(studentExamId: string, questionId: string, answerValue: string, studentId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Verify student owns this exam attempt
      const verifyResult = await client.query(
        'SELECT * FROM student_exams WHERE id = $1 AND student_id = $2 AND status = $3',
        [studentExamId, studentId, 'in_progress'],
      );

      if (verifyResult.rows.length === 0) {
        throw new BadRequestException('Invalid exam attempt or exam already completed');
      }

      // Upsert answer (handles concurrent saves)
      const answerResult = await client.query(
        `INSERT INTO student_answers (student_exam_id, question_id, answer_value, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (student_exam_id, question_id)
         DO UPDATE SET answer_value = $3, created_at = NOW()
         RETURNING *`,
        [studentExamId, questionId, answerValue],
      );

      // Update student_exam updated_at timestamp
      await client.query(
        'UPDATE student_exams SET updated_at = NOW() WHERE id = $1',
        [studentExamId],
      );

      await client.query('COMMIT');
      return answerResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // OPTIMIZED: Batch save multiple answers at once (for bulk autosave)
  async saveAnswersBatch(studentExamId: string, answers: Array<{ questionId: string; answerValue: string }>, studentId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Verify student owns this exam attempt
      const verifyResult = await client.query(
        'SELECT * FROM student_exams WHERE id = $1 AND student_id = $2 AND status = $3',
        [studentExamId, studentId, 'in_progress'],
      );

      if (verifyResult.rows.length === 0) {
        throw new BadRequestException('Invalid exam attempt or exam already completed');
      }

      // Batch upsert answers
      const savedAnswers: any[] = [];
      for (const answer of answers) {
        const result = await client.query(
          `INSERT INTO student_answers (student_exam_id, question_id, answer_value, created_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (student_exam_id, question_id)
           DO UPDATE SET answer_value = $3, created_at = NOW()
           RETURNING *`,
          [studentExamId, answer.questionId, answer.answerValue],
        );
        savedAnswers.push(result.rows[0]);
      }

      // Update student_exam updated_at timestamp
      await client.query(
        'UPDATE student_exams SET updated_at = NOW() WHERE id = $1',
        [studentExamId],
      );

      await client.query('COMMIT');
      return savedAnswers;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async completeExam(studentExamId: string, studentId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get all answers and questions to calculate score
      const answersResult = await client.query(
        `SELECT sa.*, q.correct_answer, q.section, q.domain
         FROM student_answers sa
         JOIN questions q ON sa.question_id = q.id
         WHERE sa.student_exam_id = $1`,
        [studentExamId],
      );

      const answers = answersResult.rows;
      
      // Calculate scores
      const scoreBreakdown: any = {
        readingWriting: { correct: 0, total: 0, byDomain: {} },
        math: { correct: 0, total: 0, byDomain: {} },
      };

      for (const answer of answers) {
        const isCorrect = answer.answer_value === answer.correct_answer;
        const section = answer.section === 'reading_writing' ? 'readingWriting' : 'math';

        scoreBreakdown[section].total++;
        if (isCorrect) {
          scoreBreakdown[section].correct++;
        }

        // Domain breakdown
        if (answer.domain) {
          if (!scoreBreakdown[section].byDomain[answer.domain]) {
            scoreBreakdown[section].byDomain[answer.domain] = { correct: 0, total: 0 };
          }
          scoreBreakdown[section].byDomain[answer.domain].total++;
          if (isCorrect) {
            scoreBreakdown[section].byDomain[answer.domain].correct++;
          }
        }

        // Update is_correct field
        await client.query(
          'UPDATE student_answers SET is_correct = $1 WHERE id = $2',
          [isCorrect, answer.id],
        );
      }

      // Complete the exam
      const result = await client.query(
        `UPDATE student_exams 
         SET status = 'completed', 
             completed_at = NOW(), 
             score = $1,
             updated_at = NOW()
         WHERE id = $2 AND student_id = $3 AND status = 'in_progress'
         RETURNING *`,
        [JSON.stringify(scoreBreakdown), studentExamId, studentId],
      );

      if (result.rows.length === 0) {
        throw new BadRequestException('Exam already completed or not found');
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

  async recordLockdownViolation(studentExamId: string, studentId: string) {
    const result = await this.pool.query(
      `UPDATE student_exams 
       SET lockdown_violations = lockdown_violations + 1, updated_at = NOW()
       WHERE id = $1 AND student_id = $2
       RETURNING *`,
      [studentExamId, studentId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Student exam not found');
    }

    return result.rows[0];
  }

  async getStudentExams(studentId: string, filters?: { status?: string }) {
    let query = `
      SELECT se.*, 
             e.title as exam_title,
             e.status as exam_status
      FROM student_exams se
      JOIN exams e ON se.exam_id = e.id
      WHERE se.student_id = $1
    `;
    const params: any[] = [studentId];
    let paramIndex = 2;

    if (filters?.status) {
      query += ` AND se.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    query += ' ORDER BY se.started_at DESC';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async getExamResults(examId: string) {
    const result = await this.pool.query(
      `SELECT se.*, 
              u.email as student_email,
              u.first_name,
              u.last_name
       FROM student_exams se
       JOIN users u ON se.student_id = u.id
       WHERE se.exam_id = $1
       ORDER BY se.completed_at DESC NULLS LAST, se.started_at DESC`,
      [examId],
    );

    return result.rows;
  }

  async getExamParticipation(examId: string) {
    const result = await this.pool.query(
      `SELECT student_id, status, updated_at
       FROM student_exams
       WHERE exam_id = $1`,
      [examId],
    );

    return result.rows;
  }
}
