import type { ExaminerUiLocale } from '../../config/i18n/locale';

export interface IExamPipelineNotifier {
  notifyMaterialReady(chatId: number, examId: string, locale: ExaminerUiLocale): Promise<void>;
  notifyUnsupportedMaterial(chatId: number, locale: ExaminerUiLocale): Promise<void>;
  notifyMaterialTooLargeTokens(
    chatId: number,
    locale: ExaminerUiLocale,
    estimatedTokens: number,
    limit: number
  ): Promise<void>;
  notifyScannedDocument(chatId: number, locale: ExaminerUiLocale): Promise<void>;
  notifyGenericFailure(chatId: number, locale: ExaminerUiLocale): Promise<void>;
}
