import { examinerMessagesEn } from './i18n/dictionaries';

/**
 * Back-compat named exports for English copy (logs/tests/importers).
 * Handlers should use {@link getMessage} / {@link getExaminerMessages} with Telegram locale.
 */
export {
  examinerMessagesEn as examinerMessagesEnglish,
  examinerMessagesRu as examinerMessagesRussian,
  getExaminerMessages,
  getMessage,
  getMessageForLocale,
  resolveExaminerLocale,
} from './i18n';

export { examinerMessagesEn as USER_FACING_MESSAGES_EN } from './i18n/dictionaries';
export { examinerMessagesRu as USER_FACING_MESSAGES_RU } from './i18n/dictionaries';

/** @deprecated Use getMessage(ctx, 'startExamError') */
export const USER_FACING_START_EXAM_ERROR = examinerMessagesEn.startExamError;
/** @deprecated Use getMessage(ctx, 'documentUploadError') */
export const USER_FACING_DOCUMENT_UPLOAD_ERROR = examinerMessagesEn.documentUploadError;
/** @deprecated Use getMessage(ctx, 'processingAnswerError') */
export const USER_FACING_PROCESSING_ANSWER_ERROR = examinerMessagesEn.processingAnswerError;
