import { injectable, inject } from 'tsyringe';
import type { EnqueueExamPipelineUseCase } from './enqueueExamPipeline.useCase';
import type { IExamSessionRepository } from '../ports/examSessionRepository.port';
import type { IAppLogger } from '../ports/logger.port';
import type { ExaminerUiLocale } from '../../config/i18n/locale';
import { QuotaRefundUtil } from '../../utils/quotaRefund.util';

import type { IQuotaRepository } from '../ports/quotaRepository.port';

export type UploadDocumentParams = {
  chatId: number;
  userId: bigint;
  fileId: string;
  originalFileName?: string;
  mimeType?: string;
  locale: ExaminerUiLocale;
};

export enum UploadDocumentError {
  LLM_NOT_CONFIGURED = 'LLM_NOT_CONFIGURED',
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
}

export type UploadDocumentResult = { ok: true; examId: string } | { ok: false; error: UploadDocumentError };

@injectable()
export class UploadDocumentUseCase {
  constructor(
    @inject('IExamSessionRepository') private readonly exams: IExamSessionRepository,
    @inject('EnqueueExamPipelineUseCase') private readonly enqueuePipeline: EnqueueExamPipelineUseCase,
    @inject('IQuotaRepository') private readonly quotaRepo: IQuotaRepository,
    @inject('IS_LLM_CONFIGURED') private readonly isLlmConfigured: boolean,
    @inject('IAppLogger') private readonly logger: IAppLogger
  ) {}

  async execute(params: UploadDocumentParams): Promise<UploadDocumentResult> {
    if (!this.isLlmConfigured) {
      this.logger.error('Document upload rejected: LLM client not configured');
      return { ok: false, error: UploadDocumentError.LLM_NOT_CONFIGURED };
    }

    const reserved = await this.exams.verifySubscriptionAndCreateProcessingExam(params.userId);
    if (!reserved.ok) {
      return { ok: false, error: UploadDocumentError.INSUFFICIENT_CREDITS };
    }

    const createdExamId = reserved.examId;

    this.logger.info('Created processing exam row', {
      examId: createdExamId,
      userId: params.userId.toString(),
      fileId: params.fileId,
    });

    try {
      await this.enqueuePipeline.execute({
        chatId: params.chatId,
        dbUserId: params.userId.toString(),
        examId: createdExamId,
        fileId: params.fileId,
        originalFileName: params.originalFileName,
        mimeType: params.mimeType,
        locale: params.locale,
      });

      return { ok: true, examId: createdExamId };
    } catch (error) {
      await QuotaRefundUtil.refundOnError(this.exams, this.quotaRepo, this.logger, createdExamId, params.userId, error);
      throw error;
    }
  }
}
