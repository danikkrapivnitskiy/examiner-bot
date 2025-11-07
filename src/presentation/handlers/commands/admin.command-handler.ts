import { InlineKeyboard } from 'grammy';

import { BotCommand, CallbackAction } from '../../../config/bot-commands.enum';
import type { BotContext } from '../../context';
import { BaseCommandHandler } from './base/base-command-handler';

export class AdminCommandHandler extends BaseCommandHandler {
  readonly command = BotCommand.ADMIN;

  constructor(private readonly adminIds: readonly bigint[]) {
    super();
  }

  async handle(ctx: BotContext): Promise<void> {
    if (!ctx.from || !this.adminIds.includes(BigInt(ctx.from.id))) {
      return;
    }

    const t = this.getMessages(ctx);
    const keyboard = new InlineKeyboard().text(t.commandAdminAddExamsBtn, CallbackAction.ADMIN_ADD_EXAMS);

    await ctx.reply(t.commandAdminMenu, { reply_markup: keyboard });
  }
}
