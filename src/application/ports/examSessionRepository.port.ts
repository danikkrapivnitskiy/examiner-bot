export enum CreateProcessingExamDenyReason {
  NO_ACTIVE_SUBSCRIPTION = 'no_active_subscription',
}

export type CreateProcessingExamResult =
  | { ok: true; examId: string }
  | { ok: false; reason: CreateProcessingExamDenyReason };

export interface IRecentExamData {
  id: string;
  score: number | null;
  maxScore: number | null;
  feedback: string | null;
  createdAt: Date;
}

export interface IExamSessionRepository {
  verifySubscriptionAndCreateProcessingExam(userId: bigint): Promise<CreateProcessingExamResult>;
  findReadyKnowledgeJson(examId: string, userId: bigint): Promise<unknown | null>;
  completeExam(params: {
    examId: string;
    userId: bigint;
    score: number;
    maxScore: number;
    feedback: string;
  }): Promise<void>;
  getRecentCompletedExams(userId: bigint, limit: number): Promise<IRecentExamData[]>;
}
