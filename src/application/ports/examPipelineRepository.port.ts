import type { ExamStatus } from '../../domain/exam/examStatus';

export interface IExamPipelineRepository {
  findExamPipelineRow(examId: string): Promise<{ status: ExamStatus } | null>;
  saveKnowledgeMapAndMarkReady(examId: string, payload: unknown): Promise<void>;
  refundExamCreditAndMarkError(examId: string, userId: bigint): Promise<void>;
}
