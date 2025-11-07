export type ExaminerUiLocale = 'en' | 'ru';

/** Telegram codes that reuse the Russian UI dictionary until dedicated locales exist. */
const russianDictionaryPrefixes = ['ru', 'be', 'uk'] as const;

/**
 * Maps Telegram client language_code to UI locale (examiner-bot supports en + ru).
 * Belarusian and Ukrainian map to ru for UI copy (common CIS practice when ru strings exist).
 */
export function resolveExaminerLocale(languageCode?: string | null): ExaminerUiLocale {
  const normalized = languageCode?.toLowerCase() ?? '';
  return russianDictionaryPrefixes.some((prefix) => normalized.startsWith(prefix)) ? 'ru' : 'en';
}
