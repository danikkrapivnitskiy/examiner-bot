import { InlineKeyboard } from 'grammy';
import { BotCommand } from '../../../config/bot-commands.enum';
import { env } from '../../../config/env';
import { MAX_DOCUMENT_BYTES } from '../../../config/upload.constants';
import type { BotContext } from '../../context';
import { BaseCommandHandler } from './base/base-command-handler';

export class InfoCommandHandler extends BaseCommandHandler {
  readonly command = BotCommand.INFO;

  async handle(ctx: BotContext): Promise<void> {
    const t = this.getMessages(ctx);

    const voiceLimitMins = Math.round(env.QUOTA_DAILY_AUDIO_SECONDS / 60);
    const fileSizeMb = Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024));
    const maxQuestions = env.MAX_QUESTIONS_PER_EXAM_SESSION;
    const supportUsername = env.supportUsername;
    const dailyExamsLimit = env.QUOTA_DAILY_EXAMS_GENERATED;
    const dailyMessagesLimit = env.QUOTA_DAILY_TUTOR_MESSAGES;

    const keyboard = new InlineKeyboard().text(t.commandStartMenuStartExam, 'cmd:start_exam');

    await ctx.reply(
      t.commandInfo(voiceLimitMins, fileSizeMb, maxQuestions, supportUsername, dailyExamsLimit, dailyMessagesLimit),
      {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      }
    );
  }
}
