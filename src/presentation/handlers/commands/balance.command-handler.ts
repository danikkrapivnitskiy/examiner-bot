import { InlineKeyboard } from 'grammy';
import { BotCommand, CallbackAction } from '../../../config/bot-commands.enum';
import type { BotContext } from '../../context';
import { BaseCommandHandler } from './base/base-command-handler';

export class BalanceCommandHandler extends BaseCommandHandler {
  readonly command = BotCommand.BALANCE;

  async handle(ctx: BotContext): Promise<void> {
    const dbUser = await ctx.getOrCreateDbUser().catch(() => null);

    const t = this.getMessages(ctx);

    const keyboard = new InlineKeyboard().text(t.paymentMenuButton, CallbackAction.OPEN_PAYMENTS_MENU);

    await ctx.reply(t.commandBalance(dbUser?.subscriptionEndDate), {
      reply_markup: keyboard,
    });
  }
}
