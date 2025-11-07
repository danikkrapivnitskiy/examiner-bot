import { BaseError } from '../../domain/errors/base.error';
import type { NextFunction } from 'grammy';

import type { IAppLogger } from '../../application/ports/logger.port';
import { telegramCallbackAlertMaxChars } from '../../config/messaging.constants';
import { getExaminerMessages, resolveExaminerLocale } from '../../config/i18n';
import type { BotContext } from '../context';

import type { ErrorReportingService } from '../../application/services/error-reporting.service';

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return '[unserializable error]';
  }
}

async function notifyUserOfHandlerError(ctx: BotContext, userMessage: string, alertFallback: string): Promise<void> {
  if (ctx.callbackQuery !== undefined) {
    const alertText = userMessage.length > telegramCallbackAlertMaxChars ? alertFallback : userMessage;
    try {
      await ctx.answerCallbackQuery({
        text: alertText,
        show_alert: true,
      });
    } catch {
      await ctx.reply(userMessage);
    }
    return;
  }
  await ctx.reply(userMessage);
}

/**
 * Catches errors from downstream middleware and handlers; logs and sends a localized user-facing message.
 * Mirrors tg-ai-friend-bot `error.middleware` (without Slack / DI wiring — MVP).
 */
export function createErrorMiddleware(params: { logger: IAppLogger; errorReportingService?: ErrorReportingService }) {
  const { logger, errorReportingService } = params;

  return async function errorMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
    try {
      await next();
    } catch (error: unknown) {
      const chatId = ctx.chat?.id;
      const userId = ctx.from?.id;
      const username = ctx.from?.username;
      const updateType = ctx.update !== null && ctx.update !== undefined ? Object.keys(ctx.update)[0] : 'unknown';
      const isBaseError = error instanceof BaseError;

      if (!isBaseError || error.shouldReportToSlack()) {
        logger.error('Error in bot handler', {
          error: formatUnknownError(error),
          stack: error instanceof Error ? error.stack : undefined,
          chatId,
          userId,
          username,
          updateType,
        });

        if (errorReportingService) {
          errorReportingService.report({
            name: error instanceof Error ? error.name : 'UnknownError',
            message: formatUnknownError(error),
            stack: error instanceof Error ? error.stack : undefined,
            context: { chatId, userId, username, updateType },
          });
        }
      } else {
        logger.warn('User error in bot handler', {
          error: formatUnknownError(error),
          chatId,
          userId,
          username,
        });
      }

      const locale = ctx.locale ?? resolveExaminerLocale(ctx.from?.language_code);
      const examinerMessages = getExaminerMessages(locale);
      const userMessage = isBaseError ? error.getUserMessage() : examinerMessages.unexpectedHandlerError;

      try {
        await notifyUserOfHandlerError(ctx, userMessage, examinerMessages.handlerErrorAlertFallback);
      } catch (replyError: unknown) {
        logger.error('Failed to send error message to user', {
          error: formatUnknownError(replyError),
          chatId,
          userId,
        });
      }
    }
  };
}
