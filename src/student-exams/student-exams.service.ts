import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class StudentExamsService {
  constructor(@Inject('DATABASE_POOL') private pool: Pool) {}

  private isRetryableDbError(error: any) {
    return error?.code === '40P01' || error?.code === '40001';
  }

  private async withDeadlockRetry<T>(operation: () => Promise<T>, maxAttempts = 3): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        if (!this.isRetryableDbError(error) || attempt === maxAttempts) {
          throw error;
        }

        const backoffMs = 100 * attempt;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError;
  }

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
    return this.withDeadlockRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        // Lock the exam attempt row first so save/complete flows serialize consistently.
        const verifyResult = await client.query(
          `SELECT id
           FROM student_exams
           WHERE id = $1 AND student_id = $2 AND status = $3
           FOR UPDATE`,
          [studentExamId, studentId, 'in_progress'],
        );

        if (verifyResult.rows.length === 0) {
          throw new BadRequestException('Invalid exam attempt or exam already completed');
        }

        const answerResult = await client.query(
          `INSERT INTO student_answers (student_exam_id, question_id, answer_value, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())
           ON CONFLICT (student_exam_id, question_id)
           DO UPDATE SET answer_value = EXCLUDED.answer_value, updated_at = NOW()
           RETURNING *`,
          [studentExamId, questionId, answerValue],
        );

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
    });
  }

  // OPTIMIZED: Batch save multiple answers at once (for bulk autosave)
  async saveAnswersBatch(studentExamId: string, answers: Array<{ questionId: string; answerValue: string }>, studentId: string) {
    return this.withDeadlockRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        const normalizedAnswers = Array.from(
          new Map(
            (answers || [])
              .filter((a) => a?.questionId)
              .map((a) => [a.questionId, (a.answerValue ?? '').toString()]),
          ).entries(),
        )
          .map(([questionId, answerValue]) => ({ questionId, answerValue }))
          .sort((a, b) => a.questionId.localeCompare(b.questionId));

        if (normalizedAnswers.length === 0) {
          throw new BadRequestException('No valid answers provided');
        }

        // Lock the exam attempt row first to avoid race/deadlock with completion.
        const verifyResult = await client.query(
          `SELECT id
           FROM student_exams
           WHERE id = $1 AND student_id = $2 AND status = $3
           FOR UPDATE`,
          [studentExamId, studentId, 'in_progress'],
        );

        if (verifyResult.rows.length === 0) {
          throw new BadRequestException('Invalid exam attempt or exam already completed');
        }

        const savedAnswersResult = await client.query(
          `INSERT INTO student_answers (student_exam_id, question_id, answer_value, created_at, updated_at)
           SELECT $1, a.question_id, a.answer_value, NOW(), NOW()
           FROM (
             SELECT question_id, answer_value
             FROM jsonb_to_recordset($2::jsonb) AS x(question_id uuid, answer_value text)
             ORDER BY question_id
           ) AS a
           ON CONFLICT (student_exam_id, question_id)
           DO UPDATE SET answer_value = EXCLUDED.answer_value, updated_at = NOW()
           RETURNING *`,
          [
            studentExamId,
            JSON.stringify(
              normalizedAnswers.map((answer) => ({
                question_id: answer.questionId,
                answer_value: answer.answerValue,
              })),
            ),
          ],
        );

        await client.query(
          'UPDATE student_exams SET updated_at = NOW() WHERE id = $1',
          [studentExamId],
        );

        await client.query('COMMIT');
        return savedAnswersResult.rows;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });
  }

  async completeExam(studentExamId: string, studentId: string) {
    return this.withDeadlockRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        // Lock attempt row first. This serializes final submit with ongoing autosaves.
        const attemptResult = await client.query(
          `SELECT id
           FROM student_exams
           WHERE id = $1 AND student_id = $2 AND status = 'in_progress'
           FOR UPDATE`,
          [studentExamId, studentId],
        );

        if (attemptResult.rows.length === 0) {
          throw new BadRequestException('Exam already completed or not found');
        }

        // Lock answer rows in deterministic order before computing score.
        const answersResult = await client.query(
          `SELECT sa.id, sa.answer_value, q.correct_answer, q.section, q.domain
           FROM student_answers sa
           JOIN questions q ON sa.question_id = q.id
           WHERE sa.student_exam_id = $1
           ORDER BY sa.question_id
           FOR UPDATE OF sa`,
          [studentExamId],
        );

        const answers = answersResult.rows;

        const scoreBreakdown: any = {
          readingWriting: { correct: 0, total: 0, byDomain: {} },
          math: { correct: 0, total: 0, byDomain: {} },
        };

        const correctnessPayload: Array<{ id: string; is_correct: boolean }> = [];

        for (const answer of answers) {
          const isCorrect = answer.answer_value === answer.correct_answer;
          const section = answer.section === 'reading_writing' ? 'readingWriting' : 'math';

          scoreBreakdown[section].total++;
          if (isCorrect) {
            scoreBreakdown[section].correct++;
          }

          if (answer.domain) {
            if (!scoreBreakdown[section].byDomain[answer.domain]) {
              scoreBreakdown[section].byDomain[answer.domain] = { correct: 0, total: 0 };
            }
            scoreBreakdown[section].byDomain[answer.domain].total++;
            if (isCorrect) {
              scoreBreakdown[section].byDomain[answer.domain].correct++;
            }
          }

          correctnessPayload.push({ id: answer.id, is_correct: isCorrect });
        }

        if (correctnessPayload.length > 0) {
          await client.query(
            `UPDATE student_answers sa
             SET is_correct = updates.is_correct,
                 updated_at = NOW()
             FROM jsonb_to_recordset($2::jsonb) AS updates(id uuid, is_correct boolean)
             WHERE sa.student_exam_id = $1 AND sa.id = updates.id`,
            [studentExamId, JSON.stringify(correctnessPayload)],
          );
        }

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
    });
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
