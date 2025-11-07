import type { ExaminerUiLocale } from '../../config/i18n/locale';
import { getExaminerMessages } from '../../config/i18n/dictionaries';

export function formatExamQuestionMessage(params: {
  questionNumber: number;
  totalQuestions: number;
  questionText: string;
  locale: ExaminerUiLocale;
}): string {
  const examinerMessages = getExaminerMessages(params.locale);
  return examinerMessages.questionLine(params.questionNumber, params.totalQuestions, params.questionText);
}
