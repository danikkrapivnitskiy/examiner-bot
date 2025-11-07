import { randomUUID } from 'node:crypto';

import type { NextFunction } from 'grammy';
import type Redis from 'ioredis';

import type { IAppLogger } from '../../application/ports/logger.port';
import {
  rateLimitDefaultKeyPrefix,
  rateLimitDefaultMaxRequests,
  rateLimitDefaultWindowSeconds,
  rateLimitExpireBufferSeconds,
} from '../../config/rateLimit.constants';
import { getExaminerMessages, resolveExaminerLocale } from '../../config/i18n';
import type { BotContext } from '../context';

export interface IRateLimitMiddlewareConfig {
  maxRequests?: number;
  windowSeconds?: number;
  keyPrefix?: string;
}

/**
 * Per-user sliding window rate limiting via Redis sorted sets
 * (`zremrangebyscore`, `zrangebyscore`, `zadd`, `expire`).
 * Skips slash-commands (e.g. /start) and callback queries — aligned with tg-ai-friend-bot behavior.
 */
export function createRateLimitMiddleware(params: {
  redis: Redis;
  logger: IAppLogger;
  config?: IRateLimitMiddlewareConfig;
}): (ctx: BotContext, next: NextFunction) => Promise<void> {
  const maxRequests = params.config?.maxRequests ?? rateLimitDefaultMaxRequests;
  const windowSeconds = params.config?.windowSeconds ?? rateLimitDefaultWindowSeconds;
  const keyPrefix = params.config?.keyPrefix ?? rateLimitDefaultKeyPrefix;
  const { redis, logger } = params;

  return async function rateLimitMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
    if (ctx.callbackQuery !== undefined) {
      await next();
      return;
    }

    const messageText = ctx.message?.text;
    if (typeof messageText === 'string' && messageText.startsWith('/')) {
      await next();
      return;
    }

    const userId = ctx.from?.id;
    if (userId === undefined) {
      await next();
      return;
    }

    const key = `${keyPrefix}:${userId}`;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = now - windowMs;

    try {
      await redis.zremrangebyscore(key, '-inf', windowStart);

      const timestampsInWindow = await redis.zrangebyscore(key, windowStart, '+inf');
      const currentCount = timestampsInWindow.length;

      if (currentCount >= maxRequests) {
        const oldestPair = await redis.zrange(key, 0, 0, 'WITHSCORES');
        const oldestScore = oldestPair.length >= 2 ? Number.parseFloat(String(oldestPair[1])) : windowStart;
        const retryAfterSeconds = Math.max(1, Math.ceil((oldestScore + windowMs - now) / 1000));

        logger.warn('Rate limit exceeded', {
          userId,
          chatId: ctx.chat?.id,
          maxRequests,
          windowSeconds,
          retryAfterSeconds,
        });

        const locale = ctx.locale ?? resolveExaminerLocale(ctx.from?.language_code);
        const examinerMessages = getExaminerMessages(locale);
        await ctx.reply(examinerMessages.rateLimitExceeded(retryAfterSeconds));
        return;
      }

      const member = `${now}:${randomUUID()}`;
      await redis.zadd(key, now, member);
      await redis.expire(key, windowSeconds + rateLimitExpireBufferSeconds);

      await next();
    } catch (error: unknown) {
      logger.error('Rate limit check failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      await next();
    }
  };
}
