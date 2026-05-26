import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class QuestionsService {
  constructor(@Inject('DATABASE_POOL') private pool: Pool) {}

  private normalizeAnswerForComparison(answer: string | null | undefined) {
    return (answer ?? '')
      .split('|')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0)
      .sort()
      .join('|');
  }

  private async getNextOrderIndex(
    examId: string,
    section: string,
    module: number,
  ) {
    const result = await this.pool.query(
      `SELECT COALESCE(MAX(order_index), 0) AS max_order
       FROM questions
       WHERE exam_id = $1 AND section = $2 AND module = $3 AND deleted_at IS NULL`,
      [examId, section, module],
    );

    return Number(result.rows[0]?.max_order || 0) + 1;
  }

  async findByExam(examId: string) {
    const result = await this.pool.query(
      `SELECT * FROM questions 
       WHERE exam_id = $1 AND deleted_at IS NULL 
       ORDER BY section, module, order_index, created_at`,
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
    const correctAnswer =
      questionData.correct_answer ?? questionData.correctAnswer;
    const equationLatex =
      questionData.equation_latex ?? questionData.equationLatex;

    if (
      !examId ||
      !questionData.section ||
      questionData.module === undefined ||
      !questionData.content ||
      !correctAnswer
    ) {
      throw new BadRequestException(
        'Missing required fields: exam_id/examId, section, module, content, correct_answer/correctAnswer',
      );
    }

    const orderIndex =
      questionData.order_index ??
      questionData.orderIndex ??
      (await this.getNextOrderIndex(
        examId,
        questionData.section,
        questionData.module,
      ));

    const result = await this.pool.query(
      `INSERT INTO questions (exam_id, section, module, content, correct_answer, explanation, domain, equation_latex, order_index, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
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
        orderIndex,
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
        const orderIndex =
          q.order_index ??
          q.orderIndex ??
          (await this.getNextOrderIndex(examId, q.section, q.module));

        const result = await client.query(
          `INSERT INTO questions (exam_id, section, module, content, correct_answer, explanation, domain, equation_latex, order_index, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
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
            orderIndex,
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
    const orderIndex = questionData.order_index ?? questionData.orderIndex;
    if (orderIndex !== undefined) {
      fields.push(`order_index = $${paramIndex++}`);
      values.push(orderIndex);
    }

    if (questionData.content !== undefined) {
      fields.push(`content = $${paramIndex++}`);
      values.push(JSON.stringify(questionData.content));
    }
    const correctAnswer =
      questionData.correct_answer ?? questionData.correctAnswer;
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
    const equationLatex =
      questionData.equation_latex ?? questionData.equationLatex;
    if (equationLatex !== undefined) {
      fields.push(`equation_latex = $${paramIndex++}`);
      values.push(equationLatex);
    }

    if (fields.length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    let existingQuestion: { correct_answer: string } | null = null;
    if (correctAnswer !== undefined) {
      const existingResult = await this.pool.query(
        'SELECT correct_answer FROM questions WHERE id = $1 AND deleted_at IS NULL',
        [id],
      );

      if (existingResult.rows.length === 0) {
        throw new NotFoundException(`Question with ID ${id} not found`);
      }

      existingQuestion = existingResult.rows[0];
    }

    values.push(id);

    const result = await this.pool.query(
      `UPDATE questions SET ${fields.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }

    const updatedQuestion = result.rows[0];

    if (
      existingQuestion &&
      this.normalizeAnswerForComparison(existingQuestion.correct_answer) !==
        this.normalizeAnswerForComparison(updatedQuestion.correct_answer)
    ) {
      await this.pool.query(
        `UPDATE student_answers sa
         SET is_correct = COALESCE(NULLIF(LOWER(BTRIM(sa.answer_value)), ''), '') = ANY(
           ARRAY(
             SELECT BTRIM(option_value)
             FROM unnest(string_to_array(LOWER($2), '|')) AS option_value
           )
         ),
             updated_at = NOW()
         WHERE sa.question_id = $1`,
        [id, updatedQuestion.correct_answer],
      );
    }

    return updatedQuestion;
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

  async reorderByExam(
    examId: string,
    data: { section: string; module: number; questionIdsInOrder: string[] },
  ) {
    const { section, module, questionIdsInOrder } = data;

    if (
      !section ||
      module === undefined ||
      !Array.isArray(questionIdsInOrder) ||
      questionIdsInOrder.length === 0
    ) {
      throw new BadRequestException(
        'section, module, and questionIdsInOrder are required',
      );
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const validRows = await client.query(
        `SELECT id
         FROM questions
         WHERE exam_id = $1
           AND section = $2
           AND module = $3
           AND deleted_at IS NULL`,
        [examId, section, module],
      );

      const validIds = new Set(validRows.rows.map((row) => row.id));
      if (validIds.size !== questionIdsInOrder.length) {
        throw new BadRequestException(
          'questionIdsInOrder must include all questions in this section/module',
        );
      }

      for (const id of questionIdsInOrder) {
        if (!validIds.has(id)) {
          throw new BadRequestException(
            'questionIdsInOrder contains invalid question ids',
          );
        }
      }

      for (let i = 0; i < questionIdsInOrder.length; i++) {
        await client.query(
          `UPDATE questions
           SET order_index = $1
           WHERE id = $2 AND exam_id = $3 AND deleted_at IS NULL`,
          [i + 1, questionIdsInOrder[i], examId],
        );
      }

      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
