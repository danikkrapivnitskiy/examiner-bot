import 'reflect-metadata';
import { describe, it, expect, jest } from '@jest/globals';
import { ProcessExamPipelineUseCase } from '../src/application/useCases/processExamPipeline.useCase';
import { ExamStatus } from '../src/domain/exam/examStatus';
import { MAX_DOCUMENT_ESTIMATED_TOKENS } from '../src/config/text.constants';
import { QuotaRefundUtil } from '../src/utils/quotaRefund.util';

describe('ProcessExamPipelineUseCase - Large File Limit', () => {
  it('should throw MaterialTooLargeTokensError for a very large file', async () => {
    const hugeText = 'A'.repeat(200000);

    const mockLlm = {
      generateChatCompletion: jest.fn<any>(),
      streamChatCompletion: jest.fn<any>(),
    };

    const mockExams = {
      findExamPipelineRow: jest.fn<any>().mockResolvedValue({ status: ExamStatus.PROCESSING }),
      saveKnowledgeMapAndMarkReady: jest.fn<any>(),
      reserveCreditAndCreateProcessingExam: jest.fn<any>(),
      getRecentCompletedExams: jest.fn<any>(),
      addExamsToUser: jest.fn<any>(),
      refundExamCredit: jest.fn<any>().mockResolvedValue(undefined),
      updateExamStatus: jest.fn<any>(),
      updateExamScore: jest.fn<any>(),
      getExamById: jest.fn<any>(),
    };

    const mockTextExtractor = {
      extractText: jest.fn<any>().mockResolvedValue(hugeText),
    };

    const mockFileDownloader = {
      downloadFile: jest.fn<any>(),
      downloadToDisk: jest.fn<any>().mockResolvedValue(undefined),
    };

    const mockFileStorage = {
      createTempFilePath: jest.fn<any>().mockResolvedValue('/tmp/fake.pdf'),
      getFileSizeInBytes: jest.fn<any>().mockResolvedValue(10 * 1024 * 1024), // 10 MB
      deleteFile: jest.fn<any>().mockResolvedValue(undefined),
      deleteFiles: jest.fn<any>().mockResolvedValue(undefined),
      checkTempDirectoryLimit: jest.fn<any>().mockResolvedValue(true),
    };

    const mockNotifier = {
      notifyMaterialReady: jest.fn<any>(),
      notifyUnsupportedMaterial: jest.fn<any>(),
      notifyMaterialTooLargeTokens: jest.fn<any>().mockResolvedValue(undefined),
      notifyGenericFailure: jest.fn<any>(),
    };

    const mockLogger = {
      debug: jest.fn<any>(),
      info: jest.fn<any>(),
      warn: jest.fn<any>(),
      error: jest.fn<any>(),
    };

    const mockQuotaRepo = {
      getUserQuota: jest.fn<any>(),
      deductExamCredit: jest.fn<any>(),
      refundExamCredit: jest.fn<any>(),
    };

    // Mock the refund util
    jest.spyOn(QuotaRefundUtil, 'refundOnError').mockResolvedValue(undefined);

    const useCase = new ProcessExamPipelineUseCase(
      mockLlm as any,
      mockExams as any,
      mockTextExtractor as any,
      mockFileDownloader as any,
      mockFileStorage as any,
      mockNotifier as any,
      mockQuotaRepo as any,
      mockLogger as any,
      2 // maxQuestionsPerSession
    );

    const jobData = {
      chatId: 123,
      examId: 'exam-123',
      fileId: 'file-123',
      originalFileName: 'Hurych,_Šťíha_Lékařská_mikrobiologie_repetitorium_Triton_2020.pdf',
      mimeType: 'application/pdf',
      locale: 'ru' as const,
      dbUserId: '1',
    };

    // Execute the use case
    await useCase.execute(jobData);

    // Verify that the notifier was called with the correct error
    expect(mockNotifier.notifyMaterialTooLargeTokens).toHaveBeenCalled();
    const callArgs = mockNotifier.notifyMaterialTooLargeTokens.mock.calls[0];
    expect(callArgs[0]).toBe(123); // chatId
    expect(callArgs[1]).toBe('ru'); // locale
    expect(callArgs[2]).toBeGreaterThan(MAX_DOCUMENT_ESTIMATED_TOKENS); // estimatedTokens
    expect(callArgs[3]).toBe(MAX_DOCUMENT_ESTIMATED_TOKENS); // limit
    
    // Verify that refund was called
    expect(QuotaRefundUtil.refundOnError).toHaveBeenCalled();
  });
});
