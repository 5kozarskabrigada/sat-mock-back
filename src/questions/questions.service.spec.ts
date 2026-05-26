import { NotFoundException } from '@nestjs/common';
import { QuestionsService } from './questions.service';

describe('QuestionsService', () => {
  const mockPool = {
    query: jest.fn(),
  };

  let service: QuestionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new QuestionsService(mockPool as any);
  });

  it('recomputes related student answer correctness when correct_answer changes', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ correct_answer: 'A' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'question-1', correct_answer: 'B' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const updated = await service.update('question-1', { correctAnswer: 'B' });

    expect(updated).toEqual({ id: 'question-1', correct_answer: 'B' });
    expect(mockPool.query).toHaveBeenCalledTimes(3);
    expect(mockPool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE student_answers sa'),
      ['question-1', 'B'],
    );
  });

  it('does not update student answers when correct_answer remains the same', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ correct_answer: 'A|B' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'question-1', correct_answer: 'b | a' }],
      });

    await service.update('question-1', { correctAnswer: 'b | a' });

    expect(mockPool.query).toHaveBeenCalledTimes(2);
    expect(mockPool.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE student_answers sa'),
      expect.anything(),
    );
  });

  it('throws not found when changing correct_answer on a deleted/missing question', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.update('missing-question', { correctAnswer: 'C' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });
});
