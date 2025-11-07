import type { ExaminerMessageStringKey } from './dictionaries';
import { getExaminerMessages } from './dictionaries';
import type { ExaminerUiLocale } from './locale';
import { resolveExaminerLocale } from './locale';

export type TelegramLanguageContext = {
  readonly from?: { readonly language_code?: string };
  readonly locale?: ExaminerUiLocale;
};

export function getMessage(ctx: TelegramLanguageContext | undefined, key: ExaminerMessageStringKey): string {
  const locale = ctx?.locale ?? resolveExaminerLocale(ctx?.from?.language_code);
  return getExaminerMessages(locale)[key];
}

export function getMessageForLocale(locale: ExaminerUiLocale, key: ExaminerMessageStringKey): string {
  return getExaminerMessages(locale)[key];
}
