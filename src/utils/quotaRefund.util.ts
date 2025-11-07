import type { IExamPipelineRepository } from '../application/ports/examPipelineRepository.port';
import type { IExamSessionRepository } from '../application/ports/examSessionRepository.port';
import type { IAppLogger } from '../application/ports/logger.port';
import type { IQuotaRepository } from '../application/ports/quotaRepository.port';
import { QuotaType } from '../domain/quota/quota.types';

/**
 * Utility for handling quota refunds when errors occur during the exam generation pipeline.
 * We only refund quota if the error happens before the exam starts (e.g., during document upload or AI analysis).
 * Errors during the exam itself do not trigger a refund; the user can simply retry their action.
 */
export class QuotaRefundUtil {
  static async refundOnError(
    exams:
      | IExamPipelineRepository
      | (IExamSessionRepository & { refundExamCreditAndMarkError?: (examId: string, userId: bigint) => Promise<void> }),
    quotaRepo: IQuotaRepository,
    logger: IAppLogger,
    examId: string,
    userId: bigint,
    error: unknown
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Exam pipeline failed, attempting to refund quota', {
      examId,
      userId: userId.toString(),
      error: errorMessage,
    });

    try {
      if ('refundExamCreditAndMarkError' in exams && typeof exams.refundExamCreditAndMarkError === 'function') {
        await exams.refundExamCreditAndMarkError(examId, userId);
      }

      // Refund the daily generated exams quota
      await quotaRepo.incrementQuota(userId, QuotaType.EXAMS_GENERATED, -1);

      logger.info('Successfully refunded exam credit after failure', { examId });
    } catch (refundError) {
      const detail = refundError instanceof Error ? refundError.message : String(refundError);
      logger.error('Failed to refund exam credit after failure', { examId, detail });
    }
  }
}
