import { injectable, inject } from 'tsyringe';
import {
  EmptyExtractedTextError,
  UnsupportedMaterialError,
  MaterialTooLargeTokensError,
  ScannedDocumentError,
} from '../../domain/errors/material.errors';
import { TempDirectoryFullError } from '../../domain/errors/system.errors';
import { detectMaterialKind } from '../../domain/material/materialKind';
import { ExamStatus } from '../../domain/exam/examStatus';
import type { IExamPipelineRepository } from '../ports/examPipelineRepository.port';
import type { IExamPipelineNotifier } from '../ports/examPipelineNotifier.port';
import type { ILlmClient } from '../ports/llmClient.port';
import type { IAppLogger } from '../ports/logger.port';
import type { ITextExtractor } from '../ports/textExtractor.port';
import type { IFileDownloader } from '../ports/fileDownloader.port';
import type { IFileStorage } from '../ports/fileStorage.port';
import {
  analyzeEntireMaterialWithLlm,
  ensureKnowledgeMapHasTopics,
  ensureQuestionBankNonEmpty,
  generateExamQuestionBankWithLlm,
} from '../exam/examPipeline.llm';
import { MAX_DOCUMENT_ESTIMATED_TOKENS } from '../../config/text.constants';
import { QuotaRefundUtil } from '../../utils/quotaRefund.util';
import type { IExamJobData } from '../../application/ports/examPipelineQueue.port';
import type { IQuotaRepository } from '../ports/quotaRepository.port';

/**
 * Runs the pipeline: extract text, chunk, LLM analysis, persist knowledge map on Exam, mark READY, notify user.
 * This is executed by the Worker in the background.
 */
@injectable()
export class ProcessExamPipelineUseCase {
  constructor(
    @inject('ILlmClient') private readonly llm: ILlmClient,
    @inject('IExamPipelineRepository') private readonly exams: IExamPipelineRepository,
    @inject('ITextExtractor') private readonly textExtractor: ITextExtractor,
    @inject('IFileDownloader') private readonly fileDownloader: IFileDownloader,
    @inject('IFileStorage') private readonly fileStorage: IFileStorage,
    @inject('IExamPipelineNotifier') private readonly notifier: IExamPipelineNotifier,
    @inject('IQuotaRepository') private readonly quotaRepo: IQuotaRepository,
    @inject('IAppLogger') private readonly logger: IAppLogger,
    @inject('GENERATED_QUESTIONS_PER_EXAM') private readonly generatedQuestionsPerExam: number
  ) {}

  async execute(jobData: IExamJobData): Promise<void> {
    const { chatId, examId, fileId, originalFileName, mimeType, locale, dbUserId } = jobData;
    const parsedDbUserId = BigInt(dbUserId);
    const filesToCleanup = new Set<string>();

    try {
      const row = await this.exams.findExamPipelineRow(examId);
      if (!row || row.status !== ExamStatus.PROCESSING) {
        this.logger.warn('AI pipeline skipped: exam not found or not processing', { examId });
        return;
      }

      const isWithinLimit = await this.fileStorage.checkTempDirectoryLimit(500);
      if (!isWithinLimit) {
        throw new TempDirectoryFullError();
      }

      const kind = detectMaterialKind(originalFileName, mimeType);
      if (!kind) {
        throw new UnsupportedMaterialError('Unsupported material type');
      }

      const localFilePath = await this.fileStorage.createTempFilePath(originalFileName ?? 'file');
      filesToCleanup.add(localFilePath);
      let text = '';

      await this.fileDownloader.downloadToDisk(fileId, localFilePath);
      text = await this.textExtractor.extractText({ filePath: localFilePath, kind });

      if (!text.trim()) {
        throw new EmptyExtractedTextError();
      }

      const fileSizeBytes = await this.fileStorage.getFileSizeInBytes(localFilePath);
      const fileSizeMb = fileSizeBytes / (1024 * 1024);

      if (fileSizeMb > 5 && text.length < 10000) {
        throw new ScannedDocumentError();
      }

      const estimatedTokens = Math.ceil(text.length / 2.5);
      if (estimatedTokens > MAX_DOCUMENT_ESTIMATED_TOKENS) {
        throw new MaterialTooLargeTokensError(estimatedTokens, MAX_DOCUMENT_ESTIMATED_TOKENS);
      }

      const knowledgeMap = await analyzeEntireMaterialWithLlm(this.llm, this.logger, text);
      ensureKnowledgeMapHasTopics(knowledgeMap);

      const questions = await generateExamQuestionBankWithLlm(
        this.llm,
        this.logger,
        knowledgeMap,
        this.generatedQuestionsPerExam
      );
      ensureQuestionBankNonEmpty(questions);

      const payload: unknown = {
        knowledgeMap,
        questionBank: questions,
      };

      await this.exams.saveKnowledgeMapAndMarkReady(examId, payload);

      try {
        await this.notifier.notifyMaterialReady(chatId, examId, locale);
      } catch (notifyError) {
        const detail = notifyError instanceof Error ? notifyError.message : String(notifyError);
        this.logger.error('Failed to notify user after successful AI pipeline', { examId, detail });
      }

      this.logger.info('Examiner AI pipeline completed', {
        examId,
        topics: knowledgeMap.topics.length,
        questions: questions.length,
      });
    } catch (error) {
      await QuotaRefundUtil.refundOnError(this.exams, this.quotaRepo, this.logger, examId, parsedDbUserId, error);

      if (error instanceof UnsupportedMaterialError) {
        await this.notifier.notifyUnsupportedMaterial(chatId, locale);
        return;
      }

      if (error instanceof MaterialTooLargeTokensError) {
        await this.notifier.notifyMaterialTooLargeTokens(chatId, locale, error.estimatedTokens, error.limit);
        return;
      }

      if (error instanceof ScannedDocumentError) {
        await this.notifier.notifyScannedDocument(chatId, locale);
        return;
      }

      await this.notifier.notifyGenericFailure(chatId, locale);
      throw error; // Re-throw to let BullMQ know the job failed
    } finally {
      await this.fileStorage.deleteFiles(Array.from(filesToCleanup));
    }
  }
}
