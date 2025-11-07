import { injectable, inject } from 'tsyringe';
import type Redis from 'ioredis';

import type { ExamState } from '../../domain/exam/examState.entity';
import type { IExamStateCache } from '../../application/ports/examStateCache.port';
import { examStateTtlSeconds } from '../../config/exam.constants';

function examStateRedisKey(telegramUserId: number): string {
  return `user:${telegramUserId}:exam_state`;
}

function isExamState(value: unknown): value is ExamState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.examId === 'string' &&
    typeof record.currentIndex === 'number' &&
    Number.isInteger(record.currentIndex) &&
    typeof record.score === 'number' &&
    Number.isFinite(record.score) &&
    Array.isArray(record.weakTopics) &&
    record.weakTopics.every((topic) => typeof topic === 'string') &&
    Array.isArray(record.askedQuestionIds) &&
    record.askedQuestionIds.every((id) => typeof id === 'string') &&
    typeof record.totalQuestions === 'number' &&
    Number.isInteger(record.totalQuestions) &&
    Array.isArray(record.questionPoolIds) &&
    record.questionPoolIds.every((id) => typeof id === 'string')
  );
}

@injectable()
export class RedisExamStateCache implements IExamStateCache {
  constructor(@inject('Redis') private readonly redis: Redis) {}

  async get(telegramUserId: number): Promise<ExamState | null> {
    const raw = await this.redis.get(examStateRedisKey(telegramUserId));
    if (raw === null || raw.length === 0) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isExamState(parsed)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async set(telegramUserId: number, state: ExamState): Promise<void> {
    await this.redis.set(examStateRedisKey(telegramUserId), JSON.stringify(state), 'EX', examStateTtlSeconds);
  }

  async deleteExamState(telegramUserId: number): Promise<void> {
    await this.redis.del(examStateRedisKey(telegramUserId));
  }
}
