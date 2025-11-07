import { InlineKeyboard } from 'grammy';

import { BotCommand, CallbackAction } from '../../../config/bot-commands.enum';
import type { BotContext } from '../../context';
import { BaseCommandHandler } from './base/base-command-handler';

export class LanguageCommandHandler extends BaseCommandHandler {
  readonly command = BotCommand.LANGUAGE;

  async handle(ctx: BotContext): Promise<void> {
    const t = this.getMessages(ctx);
    const currentLang = ctx.locale;
    const enText = currentLang === 'en' ? 'English ✅' : 'English';
    const ruText = currentLang === 'ru' ? 'Русский ✅' : 'Русский';

    const keyboard = new InlineKeyboard()
      .text(enText, `${CallbackAction.SET_LANGUAGE}:en`)
      .text(ruText, `${CallbackAction.SET_LANGUAGE}:ru`);

    await ctx.reply(t.commandLanguageChoose, { reply_markup: keyboard });
  }
}
