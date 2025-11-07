import type { Context } from 'grammy';

import type { PersistedTelegramUser } from '../application/ports/userRepository.port';
import type { ExaminerUiLocale } from '../config/i18n/locale';

/**
 * Telegram context extended with the persisted user row after user middleware runs.
 */
export interface BotContext extends Context {
  dbUser?: PersistedTelegramUser;
  locale: ExaminerUiLocale;
  getOrCreateDbUser: () => Promise<PersistedTelegramUser>;
}
