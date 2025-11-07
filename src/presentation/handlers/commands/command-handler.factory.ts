import { injectable, inject } from 'tsyringe';
import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';

import type { IUserPreferencesCache } from '../../../application/ports/userPreferencesCache.port';
import { BotCommand, CallbackAction } from '../../../config/bot-commands.enum';
import { getExaminerMessages } from '../../../config/i18n';
import type { ExaminerUiLocale } from '../../../config/i18n/locale';
import type { IAppLogger } from '../../../application/ports/logger.port';
import type { BotContext } from '../../context';
import type { ICommandHandler } from './base/command-handler.interface';
import type { AdminAddExamsUseCase } from '../../../application/useCases/adminAddExams.useCase';

@injectable()
export class CommandHandlerFactory {
  constructor(
    @inject('CommandHandlers') private readonly handlers: ICommandHandler[],
    @inject('IUserPreferencesCache') private readonly userPrefs: IUserPreferencesCache,
    @inject('AdminAddExamsUseCase') private readonly adminAddExamsUseCase: AdminAddExamsUseCase,
    @inject('ADMIN_IDS') private readonly adminIds: readonly bigint[],
    @inject('IAppLogger') private readonly logger: IAppLogger
  ) {}

  public attachToBot(bot: Bot<BotContext>): void {
    for (const handler of this.handlers) {
      const commands = Array.isArray(handler.command) ? handler.command : [handler.command];
      for (const cmd of commands) {
        bot.command(cmd, async (ctx) => {
          try {
            await handler.handle(ctx);
          } catch (error) {
            this.logger.error(`Error handling command ${cmd}:`, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });
      }
    }

    // Register callback for language selection
    bot.callbackQuery(new RegExp(`^${CallbackAction.SET_LANGUAGE}:(en|ru)$`), async (ctx) => {
      const lang = ctx.match[1] as ExaminerUiLocale;
      if (ctx.from) {
        await this.userPrefs.setUserLocale(BigInt(ctx.from.id), lang);
      }
      const messages = getExaminerMessages(lang);
      await ctx.answerCallbackQuery({ text: messages.commandLanguageChanged });

      const enText = lang === 'en' ? 'English ✅' : 'English';
      const ruText = lang === 'ru' ? 'Русский ✅' : 'Русский';

      const keyboard = new InlineKeyboard()
        .text(enText, `${CallbackAction.SET_LANGUAGE}:en`)
        .text(ruText, `${CallbackAction.SET_LANGUAGE}:ru`);

      await ctx.editMessageText(messages.commandLanguageChoose, { reply_markup: keyboard });
    });

    // Register callback for admin add exams
    bot.callbackQuery(CallbackAction.ADMIN_ADD_EXAMS, async (ctx) => {
      const messages = getExaminerMessages(ctx.locale);
      if (!ctx.from || !this.adminIds.includes(BigInt(ctx.from.id))) {
        await ctx.answerCallbackQuery({ text: messages.commandAdminUnauthorized });
        return;
      }

      await ctx.answerCallbackQuery();
      await ctx.reply(messages.commandAdminAddExamsPrompt, {
        /* eslint-disable @typescript-eslint/naming-convention -- Telegram Bot API payload */
        reply_markup: { force_reply: true },
        /* eslint-enable @typescript-eslint/naming-convention */
      });
    });

    // Register callback for payments menu
    bot.callbackQuery(CallbackAction.OPEN_PAYMENTS_MENU, async (ctx) => {
      await ctx.answerCallbackQuery();
      const paymentsHandler = this.handlers.find((h) => h.command === BotCommand.PAYMENTS);
      if (paymentsHandler) {
        await paymentsHandler.handle(ctx);
      }
    });

    // Register callback for referral menu
    bot.callbackQuery(CallbackAction.OPEN_REFERRAL_MENU, async (ctx) => {
      await ctx.answerCallbackQuery();
      const referralHandler = this.handlers.find((h) => h.command === BotCommand.REF);
      if (referralHandler) {
        await referralHandler.handle(ctx);
      }
    });

    // Register callback for start new exam prompt
    bot.callbackQuery(CallbackAction.PROMPT_START_EXAM, async (ctx) => {
      await ctx.answerCallbackQuery();
      const startExamHandler = this.handlers.find((h) => h.command === BotCommand.START_EXAM);
      if (startExamHandler) {
        await startExamHandler.handle(ctx);
      }
    });

    // Intercept force replies for admin commands
    bot.on('message:text', async (ctx, next) => {
      const replyToMessage = ctx.message.reply_to_message;
      if (!replyToMessage || !('text' in replyToMessage)) {
        await next();
        return;
      }

      if (!ctx.from || !this.adminIds.includes(BigInt(ctx.from.id))) {
        await next();
        return;
      }

      const messages = getExaminerMessages(ctx.locale);

      // Check if the reply is to the add exams prompt
      if (replyToMessage.text === messages.commandAdminAddExamsPrompt) {
        const text = ctx.message.text.trim();
        const args = text.split(' ').filter(Boolean);

        if (args.length !== 2) {
          await ctx.reply(messages.commandAddExamsError);
          return;
        }

        const targetUserId = BigInt(args[0]);
        const amount = Number.parseInt(args[1], 10);

        if (Number.isNaN(amount)) {
          await ctx.reply(messages.commandAddExamsError);
          return;
        }

        const outcome = await this.adminAddExamsUseCase.execute({ targetUserId, amount });
        if (outcome.ok) {
          await ctx.reply(messages.commandAddExamsSuccess(amount, targetUserId.toString()));
        } else {
          await ctx.reply(messages.commandAddExamsError);
        }
        return;
      }

      await next();
    });
  }
}
