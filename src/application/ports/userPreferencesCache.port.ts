import type { ExaminerUiLocale } from '../../config/i18n/locale';

export interface IUserPreferencesCache {
  getUserLocale(userId: bigint): Promise<ExaminerUiLocale | null>;
  setUserLocale(userId: bigint, locale: ExaminerUiLocale): Promise<void>;
}
