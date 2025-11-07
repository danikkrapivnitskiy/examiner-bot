import { BotCommand } from '../../../config/bot-commands.enum';
import type { BotContext } from '../../context';
import { BaseCommandHandler } from './base/base-command-handler';

export class ChatIdCommandHandler extends BaseCommandHandler {
  readonly command = [BotCommand.ID, BotCommand.CHAT_ID];

  async handle(ctx: BotContext): Promise<void> {
    const chatId = ctx.chat?.id.toString() ?? 'unknown';
    const userId = ctx.from?.id.toString() ?? 'unknown';

    const t = this.getMessages(ctx);
    await ctx.reply(t.commandChatId(chatId, userId));
  }
}
