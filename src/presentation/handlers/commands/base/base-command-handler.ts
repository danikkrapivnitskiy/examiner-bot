import { getExaminerMessages, type IExaminerMessages } from '../../../../config/i18n';
import type { BotCommand } from '../../../../config/bot-commands.enum';
import type { BotContext } from '../../../context';
import type { ICommandHandler } from './command-handler.interface';

export abstract class BaseCommandHandler implements ICommandHandler {
  abstract readonly command: BotCommand | BotCommand[];

  protected getMessages(ctx: BotContext): IExaminerMessages {
    return getExaminerMessages(ctx.locale);
  }

  abstract handle(ctx: BotContext): Promise<void>;
}
