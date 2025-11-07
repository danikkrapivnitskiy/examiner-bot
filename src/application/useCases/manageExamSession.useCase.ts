import { injectable, inject } from 'tsyringe';
import type { ExamState } from '../../domain/exam/examState.entity';

import type { IExamStateCache } from '../ports/examStateCache.port';

@injectable()
export class ManageExamSessionUseCase {
  constructor(@inject('IExamStateCache') private readonly cache: IExamStateCache) {}

  getExamState(telegramUserId: number): Promise<ExamState | null> {
    return this.cache.get(telegramUserId);
  }

  setExamState(telegramUserId: number, state: ExamState): Promise<void> {
    return this.cache.set(telegramUserId, state);
  }

  deleteExamState(telegramUserId: number): Promise<void> {
    return this.cache.deleteExamState(telegramUserId);
  }
}
