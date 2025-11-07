import type { Middleware } from 'grammy';

import type { IUserRepository } from '../../application/ports/userRepository.port';
import type { IUserPreferencesCache } from '../../application/ports/userPreferencesCache.port';
import type { IAppLogger } from '../../application/ports/logger.port';
import { resolveExaminerLocale } from '../../config/i18n';
import type { BotContext } from '../context';
import type { IStatisticsService } from '../../application/ports/statisticsService.port';

/**
 * Ensures the Telegram sender exists in `users`, exposes account fields on context,
 * and persists UI locale from Telegram for use outside inbound updates.
 */
export function createUserMiddleware(params: {
  users: IUserRepository;
  userPrefs: IUserPreferencesCache;
  logger: IAppLogger;
  statisticsService: IStatisticsService;
}): Middleware<BotContext> {
  const { users, userPrefs, logger, statisticsService } = params;

  return async (ctx, next) => {
    ctx.locale = 'en';

    const from = ctx.from;
    if (!from) {
      ctx.getOrCreateDbUser = async () => {
        throw new Error('Cannot create user without ctx.from');
      };
      await next();
      return;
    }

    try {
      // First check if user has explicitly set a language preference
      const savedLocale = await userPrefs.getUserLocale(BigInt(from.id));

      if (savedLocale) {
        ctx.locale = savedLocale;
      } else {
        // Fallback to Telegram language code if no preference is set
        const locale = resolveExaminerLocale(from.language_code);
        ctx.locale = locale;
        // Save the detected locale so we don't have to resolve it again
        await userPrefs.setUserLocale(BigInt(from.id), locale);
      }
    } catch (error) {
      logger.warn('Failed to get/set user locale from Redis', {
        telegramId: from.id,
        error: error instanceof Error ? error.message : String(error),
      });
      // Fallback to Telegram language code on error
      ctx.locale = resolveExaminerLocale(from.language_code);
    }

    ctx.getOrCreateDbUser = async () => {
      if (ctx.dbUser) {
        return ctx.dbUser;
      }

      let referredBy: bigint | undefined;
      if (ctx.message?.text?.startsWith('/start ')) {
        const match = ctx.message.text.split(' ')[1]?.trim();
        if (match) {
          try {
            const referrer = await users.getUserByReferralCode(match);
            if (referrer && referrer.id !== BigInt(from.id)) {
              referredBy = referrer.id;
            }
          } catch {
            // ignore invalid referral payload
          }
        }
      }

      try {
        // Optimization: Use upsert to avoid separate findUnique and create queries
        const dbUser = await users.upsertTelegramUser(BigInt(from.id), from.username, from.first_name, referredBy);

        // Background diffing: update profile if it has changed
        const needsUpdate =
          dbUser.username !== (from.username ?? null) || dbUser.firstName !== (from.first_name ?? null);
        if (needsUpdate) {
          users.updateProfile(BigInt(from.id), from.username, from.first_name).catch((err: unknown) => {
            logger.error('Failed to update user profile in background', {
              telegramId: from.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }

        ctx.dbUser = dbUser;
        logger.debug('User context resolved', {
          telegramId: from.id,
          subscriptionEndDate: dbUser.subscriptionEndDate,
        });

        // Track DAU (Daily Active Users)
        statisticsService.trackActiveUser(from.id).catch((err: unknown) => {
          logger.error('Failed to track active user', {
            telegramId: from.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });

        return dbUser;
      } catch (error) {
        logger.error('Failed to upsert user', {
          telegramId: from.id,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    };

    await next();
  };
}
