import { injectable, inject } from 'tsyringe';
import type Redis from 'ioredis';

import type { IUserPreferencesCache } from '../../application/ports/userPreferencesCache.port';
import type { ExaminerUiLocale } from '../../config/i18n/locale';

function userPrefsRedisKey(userId: bigint): string {
  return `user:${userId.toString()}:settings`;
}

function parseLocale(raw: string): ExaminerUiLocale | null {
  return raw === 'en' || raw === 'ru' ? raw : null;
}

@injectable()
export class RedisUserPreferencesCache implements IUserPreferencesCache {
  constructor(@inject('Redis') private readonly redis: Redis) {}

  async getUserLocale(userId: bigint): Promise<ExaminerUiLocale | null> {
    const key = userPrefsRedisKey(userId);

    try {
      const hashLang = await this.redis.hget(key, 'language');
      if (hashLang !== null) {
        return parseLocale(hashLang);
      }
    } catch {
      // If it throws WRONGTYPE, it means it's still a string key.
      // We will fall back to reading it as a string below.
    }

    // Fallback and migration for old plain text / JSON string format
    try {
      const raw = await this.redis.get(key);
      if (raw === null || raw.length === 0) {
        return null;
      }

      let parsedLang = '';
      try {
        const parsed = JSON.parse(raw) as { language?: string };
        parsedLang = parsed.language ?? '';
      } catch {
        parsedLang = raw;
      }

      const locale = parseLocale(parsedLang);
      if (locale) {
        // Migrate to hash format
        await this.redis.del(key);
        await this.redis.hset(key, 'language', locale);
      }
      return locale;
    } catch {
      return null;
    }
  }

  async setUserLocale(userId: bigint, locale: ExaminerUiLocale): Promise<void> {
    const key = userPrefsRedisKey(userId);

    // Ensure we don't conflict with an old string key
    try {
      await this.redis.hset(key, 'language', locale);
    } catch {
      // If WRONGTYPE, delete the old string key and try again
      await this.redis.del(key);
      await this.redis.hset(key, 'language', locale);
    }
  }
}
