import { injectable, inject } from 'tsyringe';
import type { IExamSessionRepository } from '../ports/examSessionRepository.port';
import type { StoredKnowledgePayload } from '../exam/examKnowledge.schema';
import { parseKnowledgeMapPayload } from '../exam/examKnowledge.schema';

export enum LoadExamTurnContextError {
  MATERIAL_NO_LONGER_AVAILABLE = 'MATERIAL_NO_LONGER_AVAILABLE',
  COULD_NOT_READ_QUESTIONS = 'COULD_NOT_READ_QUESTIONS',
  COULD_NOT_LOAD_CURRENT_QUESTION = 'COULD_NOT_LOAD_CURRENT_QUESTION',
}

export type ExamTurnContext =
  | {
      ok: true;
      payload: StoredKnowledgePayload;
      examQuestion: StoredKnowledgePayload['questionBank'][number];
    }
  | { ok: false; error: LoadExamTurnContextError };

@injectable()
export class LoadExamTurnContextUseCase {
  constructor(@inject('IExamSessionRepository') private readonly exams: IExamSessionRepository) {}

  async execute(params: { examId: string; dbUserId: bigint; questionId: string }): Promise<ExamTurnContext> {
    const json = await this.exams.findReadyKnowledgeJson(params.examId, params.dbUserId);
    if (json === null) {
      return {
        ok: false,
        error: LoadExamTurnContextError.MATERIAL_NO_LONGER_AVAILABLE,
      };
    }

    const payload = parseKnowledgeMapPayload(json);
    if (!payload) {
      return {
        ok: false,
        error: LoadExamTurnContextError.COULD_NOT_READ_QUESTIONS,
      };
    }

    const examQuestion = payload.questionBank.find((questionItem) => questionItem.id === params.questionId);
    if (!examQuestion) {
      return {
        ok: false,
        error: LoadExamTurnContextError.COULD_NOT_LOAD_CURRENT_QUESTION,
      };
    }

    return { ok: true, payload, examQuestion };
  }
}
