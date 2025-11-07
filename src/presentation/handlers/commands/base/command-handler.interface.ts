import type { BotCommand } from '../../../../config/bot-commands.enum';
import type { BotContext } from '../../../context';

export interface ICommandHandler {
  readonly command: BotCommand | BotCommand[];
  handle(ctx: BotContext): Promise<void>;
}
