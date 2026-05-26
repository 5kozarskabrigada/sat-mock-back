import { Injectable, Inject, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PdfService } from '../pdf/pdf.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class StudentExamsService {
  constructor(
    @Inject('DATABASE_POOL') private pool: Pool,
    private pdfService: PdfService,
    private emailService: EmailService,
  ) {}
  private readonly logger = new Logger(StudentExamsService.name);

  private isRetryableDbError(error: any) {
    return error?.code === '40P01' || error?.code === '40001';
  }
  private normalizeAnswer(value: string | null | undefined): string {
    return (value ?? '').toString().trim().toLowerCase();
  }

  private async withDeadlockRetry<T>(operation: () => Promise<T>, maxAttempts = 3): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        if (!this.isRetryableDbError(error) || attempt === maxAttempts) {
          if (this.isRetryableDbError(error)) {
            this.logger.error(
              `Retryable DB error exhausted after ${attempt}/${maxAttempts} attempts (code=${error?.code || 'unknown'})`,
            );
          }
          throw error;
        }

        const backoffMs = 100 * attempt;
        this.logger.warn(
          `Retrying DB transaction after ${error?.code || 'unknown'} (attempt ${attempt}/${maxAttempts}, backoff=${backoffMs}ms)`,
        );
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
      `SELECT
         sa.id,
         sa.student_exam_id,
         sa.question_id,
         sa.answer_value,
         CASE
           WHEN q.id IS NULL THEN NULL
           ELSE lower(btrim(COALESCE(sa.answer_value, ''))) = lower(btrim(COALESCE(q.correct_answer, '')))
         END AS is_correct,
         sa.time_spent,
         sa.created_at,
         sa.updated_at
       FROM student_answers sa
       LEFT JOIN questions q ON q.id = sa.question_id
       WHERE sa.student_exam_id = $1
       ORDER BY sa.question_id`,
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
          const isCorrect = answer.correct_answer
          .split('|')
          .map((a: string) => a.trim().toLowerCase())
          .includes(answer.answer_value?.trim().toLowerCase());
          const section = answer.section === 'reading_writing' ? 'readingWriting' : 'math';

          scoreBreakdown[section].total++;
          if (isCorrect) {
            scoreBreakdown[section].correct++;
          }

                    const isCorrect =
                      this.normalizeAnswer(answer.answer_value) === this.normalizeAnswer(answer.correct_answer);
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

  async generateAndSendReport(studentExamId: string, customEmail?: string) {
    try {
      // Fetch student exam data
      const examResult = await this.pool.query(
        `SELECT se.*, u.first_name, u.last_name, u.username, u.email as student_email, e.title as exam_title
         FROM student_exams se
         JOIN users u ON u.id = se.student_id
         JOIN exams e ON e.id = se.exam_id
         WHERE se.id = $1 AND se.status = 'completed'`,
        [studentExamId],
      );

      if (examResult.rows.length === 0) {
        throw new NotFoundException('Completed exam not found');
      }

      const examData = examResult.rows[0];
      const studentEmail = customEmail || examData.student_email;

      if (!studentEmail || studentEmail.includes('@sat-platform.local')) {
        throw new BadRequestException('Valid student email required to send report');
      }

      // Fetch answers
      const answersResult = await this.pool.query(
        `SELECT
           sa.question_id,
           sa.answer_value,
           CASE
             WHEN q.id IS NULL THEN NULL
             ELSE lower(btrim(COALESCE(sa.answer_value, ''))) = lower(btrim(COALESCE(q.correct_answer, '')))
           END AS is_correct
         FROM student_answers sa
         LEFT JOIN questions q ON q.id = sa.question_id
         WHERE sa.student_exam_id = $1`,
        [studentExamId],
      );

      // Fetch questions
      const questionsResult = await this.pool.query(
        `SELECT id, domain, correct_answer, section, module, content
         FROM questions
         WHERE exam_id = $1 AND deleted_at IS NULL
         ORDER BY section, module, id`,
        [examData.exam_id],
      );

      const answers = answersResult.rows;
      const questions = questionsResult.rows;

      // Calculate scores
      const rwQuestions = questions.filter((q) => q.section === 'reading_writing');
      const mathQuestions = questions.filter((q) => q.section === 'math');

      const rwM1Questions = questions.filter((q) => q.section === 'reading_writing' && q.module === 1);
      const rwM2Questions = questions.filter((q) => q.section === 'reading_writing' && q.module === 2);
      const mathM1Questions = questions.filter((q) => q.section === 'math' && q.module === 1);
      const mathM2Questions = questions.filter((q) => q.section === 'math' && q.module === 2);

      const rwM1Correct = answers.filter((a) => a.is_correct && rwM1Questions.some((q) => q.id === a.question_id)).length;
      const rwM2Correct = answers.filter((a) => a.is_correct && rwM2Questions.some((q) => q.id === a.question_id)).length;
      const mathM1Correct = answers.filter((a) => a.is_correct && mathM1Questions.some((q) => q.id === a.question_id)).length;
      const mathM2Correct = answers.filter((a) => a.is_correct && mathM2Questions.some((q) => q.id === a.question_id)).length;

      // Simplified SAT scoring (you may want to use the actual conversion tables)
      const rwScore = this.calculateRWScore(rwM1Correct, rwM2Correct);
      const mathScore = this.calculateMathScore(mathM1Correct, mathM2Correct);
      const totalScore = rwScore + mathScore;

      // Module summaries
      const moduleSummaries = [
        { label: 'Reading & Writing Module 1', correct: rwM1Correct, total: rwM1Questions.length },
        { label: 'Reading & Writing Module 2', correct: rwM2Correct, total: rwM2Questions.length },
        { label: 'Math Module 1', correct: mathM1Correct, total: mathM1Questions.length },
        { label: 'Math Module 2', correct: mathM2Correct, total: mathM2Questions.length },
      ].filter((m) => m.total > 0);

      // Domain scores
      const domains = [...new Set(questions.map((q) => q.domain))];
      const domainScores = domains.map((domain) => {
        const domainQuestions = questions.filter((q) => q.domain === domain);
        const correct = answers.filter(
          (a) => a.is_correct && domainQuestions.some((q) => q.id === a.question_id),
        ).length;
        return {
          domain,
          correct,
          total: domainQuestions.length,
          percentage: (correct / domainQuestions.length) * 100,
        };
      });

      // Section breakdowns
      const moduleGroups = [
        { label: 'Reading & Writing Module 1', section: 'reading_writing', module: 1 },
        { label: 'Reading & Writing Module 2', section: 'reading_writing', module: 2 },
        { label: 'Math Module 1', section: 'math', module: 1 },
        { label: 'Math Module 2', section: 'math', module: 2 },
      ];

      const sectionBreakdowns = moduleGroups
        .map((group) => {
          const moduleQuestions = questions.filter((q) => q.section === group.section && q.module === group.module);

          if (moduleQuestions.length === 0) return null;

          const questionDetails = moduleQuestions.map((question, index) => {
            const answer = answers.find((a) => a.question_id === question.id);
            const result: 'Correct' | 'Incorrect' | 'Skipped' = answer?.is_correct ? 'Correct' : answer ? 'Incorrect' : 'Skipped';

            return {
              number: index + 1,
              domain: question.domain,
              correctAnswer: question.correct_answer,
              studentAnswer: answer?.answer_value || '(Skipped)',
              result,
            };
          });

          return {
            label: group.label,
            correct: questionDetails.filter((q) => q.result === 'Correct').length,
            total: questionDetails.length,
            questions: questionDetails,
          };
        })
        .filter((section) => section !== null);

      // Generate PDF
      const reportData = {
        student: {
          firstName: examData.first_name,
          lastName: examData.last_name,
          username: examData.username,
          email: studentEmail,
        },
        exam: {
          title: examData.exam_title,
          completedAt: examData.completed_at,
        },
        totalScore,
        rwScore,
        mathScore,
        moduleSummaries,
        domainScores,
        sectionBreakdowns,
        lockdownViolations: examData.lockdown_violations || 0,
      };

      const pdfBuffer = await this.pdfService.generateExamReportPDF(reportData);

      // Send email
      await this.emailService.sendExamReportEmail(
        studentEmail,
        {
          firstName: examData.first_name,
          lastName: examData.last_name,
          examTitle: examData.exam_title,
          totalScore,
        },
        pdfBuffer,
      );

      return {
        success: true,
        message: `Report sent successfully to ${studentEmail}`,
        score: totalScore,
      };
    } catch (error) {
      this.logger.error('Failed to generate and send report:', error);
      throw error;
    }
  }

  private calculateRWScore(m1Correct: number, m2Correct: number): number {
    // Simplified conversion - in production, use actual SAT conversion tables
    const totalCorrect = m1Correct + m2Correct;
    return Math.min(800, 200 + totalCorrect * 10);
  }

  private calculateMathScore(m1Correct: number, m2Correct: number): number {
    // Simplified conversion - in production, use actual SAT conversion tables
    const totalCorrect = m1Correct + m2Correct;
    return Math.min(800, 200 + totalCorrect * 10);
  }
}
