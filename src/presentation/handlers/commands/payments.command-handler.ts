import { inject, injectable } from 'tsyringe';
import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../../context';
import { BotCommand } from '../../../config/bot-commands.enum';
import type { ICommandHandler } from './base/command-handler.interface';
import { getExaminerMessages } from '../../../config/i18n';
import { env } from '../../../config/env';
import type { IStatisticsService } from '../../../application/ports/statisticsService.port';

@injectable()
export class PaymentsCommandHandler implements ICommandHandler {
  public readonly command = BotCommand.PAYMENTS;

  constructor(@inject('IStatisticsService') private readonly statisticsService: IStatisticsService) {}

  public async handle(ctx: BotContext): Promise<void> {
    const messages = getExaminerMessages(ctx.locale);
    const userId = ctx.from?.id;

    if (!userId || (!env.stripePaymentLinkEur && !env.stripePaymentLinkCzk)) {
      await ctx.reply(messages.paymentUnavailable);
      return;
    }

    // Track the payment menu opening
    await this.statisticsService.trackPaymentOpened(userId).catch(() => {});

    const keyboard = new InlineKeyboard();

    if (env.stripePaymentLinkEur) {
      const urlEur = `${env.stripePaymentLinkEur}?client_reference_id=${userId}`;
      keyboard.url(messages.commandPaymentsPayEur(env.examPriceEur), urlEur);
    }

    if (env.stripePaymentLinkCzk) {
      const urlCzk = `${env.stripePaymentLinkCzk}?client_reference_id=${userId}`;
      keyboard.url(messages.commandPaymentsPayCzk(env.examPriceCzk), urlCzk);
    }

    const text = `${messages.commandPaymentsTitle}\n\n${messages.commandPaymentsDescription}`;

    /* eslint-disable @typescript-eslint/naming-convention */
    await ctx.reply(text, {
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    });
    /* eslint-enable @typescript-eslint/naming-convention */
  }
}
