import type { ExamState } from '../../domain/exam/examState.entity';

export interface IExamStateCache {
  get(telegramUserId: number): Promise<ExamState | null>;
  set(telegramUserId: number, state: ExamState): Promise<void>;
  deleteExamState(telegramUserId: number): Promise<void>;
}
