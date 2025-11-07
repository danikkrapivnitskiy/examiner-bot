import type { Bot, NextFunction } from 'grammy';

import type { BotContext } from '../context';
import { getExaminerMessages } from '../../config/i18n';
import { env } from '../../config/env';
import { AppEdition } from '../../config/app-edition.enum';
import { processExamAnswerFromUserText, type ExamAnswerHandlerDeps } from './examAnswerShared';

import { QUOTA_DAILY_TUTOR_MESSAGES } from '../../config/quota.constants';
import { MAX_USER_TEXT_LENGTH } from '../../config/text.constants';
import { QuotaType } from '../../domain/quota/quota.types';

export type TextHandlerDeps = ExamAnswerHandlerDeps;

/**
 * Handles free-text replies while an exam session is active in Redis.
 */
export function registerTextHandler(bot: Bot<BotContext>, deps: TextHandlerDeps): void {
  bot.on('message:text', async (ctx, next: NextFunction) => {
    const text = ctx.message.text?.trim() ?? '';
    if (text.length === 0 || text.startsWith('/')) {
      await next();
      return;
    }

    if (text.length > MAX_USER_TEXT_LENGTH) {
      const examinerMessages = getExaminerMessages(ctx.locale);
      await ctx.reply(
        examinerMessages.textMessageTooLong ||
          `Your message is too long. Please keep it under ${MAX_USER_TEXT_LENGTH} characters.`
      );
      return;
    }

    if (!ctx.from) {
      await next();
      return;
    }

    const locale = ctx.locale;
    const userId = ctx.from.id;
    const updateId = ctx.update.update_id;

    // Check if this update was already processed (idempotency for webhook retries)
    if (updateId) {
      const isProcessed = await deps.userLock.checkMessageProcessed(userId, updateId);
      if (isProcessed) {
        deps.logger.debug('Ignoring duplicate update from Telegram', { userId, updateId });
        return; // Don't call next(), just end execution
      }
    }

    // First, check if state exists without acquiring lock to avoid blocking non-exam messages
    let state = await deps.examSessions.getExamState(userId);
    if (!state) {
      const examinerMessages = getExaminerMessages(locale);
      await ctx.reply(examinerMessages.commandStartExam);
      return;
    }

    const dbUser = await ctx.getOrCreateDbUser().catch(() => null);
    if (!dbUser) {
      await next();
      return;
    }

    const dbUserId = dbUser.id;

    // Acquire lock to prevent race conditions (e.g. double taps, webhook retries)
    const lockAcquired = await deps.userLock.acquireLock(userId, 120);
    if (!lockAcquired) {
      const examinerMessages = getExaminerMessages(locale);
      await ctx.reply(examinerMessages.processingInProgress);
      return;
    }

    try {
      // Fetch state again after acquiring lock to ensure it hasn't changed
      state = await deps.examSessions.getExamState(userId);
      if (!state) {
        return;
      }

      // Check daily tutor messages quota
      if (env.appEdition !== AppEdition.COMMUNITY) {
        const currentMessages = await deps.quotaRepo.incrementQuota(dbUserId, QuotaType.TUTOR_MESSAGES, 1);
        if (currentMessages > QUOTA_DAILY_TUTOR_MESSAGES) {
          const examinerMessages = getExaminerMessages(locale);
          await ctx.reply(
            examinerMessages.dailyTutorLimitReached ||
              'You have reached your daily limit for tutor messages. Please come back tomorrow!'
          );
          return;
        }
      }

      await processExamAnswerFromUserText({
        ctx,
        deps,
        userId,
        dbUserId,
        state,
        userAnswer: text,
        locale,
      });
    } finally {
      await deps.userLock.releaseLock(userId);
    }
  });
}
