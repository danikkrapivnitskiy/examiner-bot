import { injectable, inject } from 'tsyringe';
import type { IExamSessionRepository } from '../ports/examSessionRepository.port';
import type { IExamStateCache } from '../ports/examStateCache.port';
import { parseKnowledgeMapPayload } from '../exam/examKnowledge.schema';
import { buildInitialExamState, buildQuestionPool } from '../exam/examSession.logic';

export enum StartExamSessionError {
  EXAM_NOT_AVAILABLE = 'EXAM_NOT_AVAILABLE',
  NO_QUESTIONS_FOUND = 'NO_QUESTIONS_FOUND',
  EMPTY_QUESTION_POOL = 'EMPTY_QUESTION_POOL',
  COULD_NOT_LOAD_FIRST_QUESTION = 'COULD_NOT_LOAD_FIRST_QUESTION',
}

export type StartExamSessionOutcome =
  | {
      ok: true;
      firstQuestionText: string;
      totalQuestions: number;
    }
  | { ok: false; error: StartExamSessionError };

@injectable()
export class StartExamSessionUseCase {
  constructor(
    @inject('IExamSessionRepository') private readonly exams: IExamSessionRepository,
    @inject('IExamStateCache') private readonly examCache: IExamStateCache,
    @inject('MAX_QUESTIONS_PER_SESSION') private readonly maxQuestionsPerSession: number
  ) {}

  async execute(params: {
    examId: string;
    telegramUserId: number;
    dbUserId: bigint;
  }): Promise<StartExamSessionOutcome> {
    const json = await this.exams.findReadyKnowledgeJson(params.examId, params.dbUserId);
    if (json === null) {
      return {
        ok: false,
        error: StartExamSessionError.EXAM_NOT_AVAILABLE,
      };
    }

    const payload = parseKnowledgeMapPayload(json);
    if (!payload || payload.questionBank.length === 0) {
      return {
        ok: false,
        error: StartExamSessionError.NO_QUESTIONS_FOUND,
      };
    }

    const poolIds = buildQuestionPool({
      questions: payload.questionBank,
      maxQuestions: this.maxQuestionsPerSession,
    });

    const examState = buildInitialExamState({ examId: params.examId, questionPoolIds: poolIds });
    if (!examState) {
      return {
        ok: false,
        error: StartExamSessionError.EMPTY_QUESTION_POOL,
      };
    }

    await this.examCache.deleteExamState(params.telegramUserId);
    await this.examCache.set(params.telegramUserId, examState);

    const firstId = poolIds[0];
    const firstQuestion = payload.questionBank.find((questionItem) => questionItem.id === firstId);
    if (!firstQuestion) {
      await this.examCache.deleteExamState(params.telegramUserId);
      return {
        ok: false,
        error: StartExamSessionError.COULD_NOT_LOAD_FIRST_QUESTION,
      };
    }

    return {
      ok: true,
      firstQuestionText: firstQuestion.question,
      totalQuestions: poolIds.length,
    };
  }
}
