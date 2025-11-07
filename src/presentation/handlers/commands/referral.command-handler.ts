import { BotCommand } from '../../../config/bot-commands.enum';
import type { BotContext } from '../../context';
import { BaseCommandHandler } from './base/base-command-handler';
import { env } from '../../../config/env';

export class ReferralCommandHandler extends BaseCommandHandler {
  readonly command = BotCommand.REF;

  async handle(ctx: BotContext): Promise<void> {
    const t = this.getMessages(ctx);
    const dbUser = await ctx.getOrCreateDbUser().catch(() => null);
    if (ctx.me?.username && dbUser?.referralCode) {
      const botName = ctx.me.username;
      const referralCode = dbUser.referralCode;
      const link = `https://t.me/${botName}?start=${referralCode}`;
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(t.referralShareButton)}`;

      await ctx.reply(t.referralLinkMessage(botName, referralCode, env.REFERRAL_BONUS_DAYS, env.TRIAL_DAYS_REFERRED), {
        /* eslint-disable @typescript-eslint/naming-convention -- Telegram Bot API payload */
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t.referralShareButton,
                url: shareUrl,
              },
            ],
          ],
        },
        parse_mode: 'HTML',
        /* eslint-enable @typescript-eslint/naming-convention */
      });
    }
  }
}
