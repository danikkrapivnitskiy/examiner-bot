import { BotCommand } from '../../../config/bot-commands.enum';
import type { BotContext } from '../../context';
import { BaseCommandHandler } from './base/base-command-handler';

export class StartExamCommandHandler extends BaseCommandHandler {
  readonly command = BotCommand.START_EXAM;

  async handle(ctx: BotContext): Promise<void> {
    const t = this.getMessages(ctx);
    await ctx.reply(t.commandStartExam);
  }
}
