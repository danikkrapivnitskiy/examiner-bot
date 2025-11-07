import type { ExaminerUiLocale } from '../../config/i18n/locale';

export interface IExamJobData {
  readonly chatId: number;
  readonly dbUserId: bigint | string; // BigInt gets serialized as string in JSON
  readonly examId: string;
  readonly fileId: string; // The telegram file_id to download
  readonly originalFileName: string | undefined;
  readonly mimeType: string | undefined;
  readonly locale: ExaminerUiLocale;
}

export interface IExamPipelineQueue {
  enqueueExam(jobData: IExamJobData): Promise<string | null>;
}
