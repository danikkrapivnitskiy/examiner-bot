import { MAX_OUTBOUND_MESSAGE_CHARS } from '../../../config/messaging.constants';
import type { IExamSessionRepository } from '../../../application/ports/examSessionRepository.port';
import { BotCommand } from '../../../config/bot-commands.enum';
import type { BotContext } from '../../context';
import { BaseCommandHandler } from './base/base-command-handler';

export class StatisticsCommandHandler extends BaseCommandHandler {
  readonly command = BotCommand.STATISTICS;

  constructor(
    private readonly examsRepo: IExamSessionRepository,
    private readonly limit: number
  ) {
    super();
  }

  async handle(ctx: BotContext): Promise<void> {
    if (!ctx.from) {
      return;
    }

    const messages = this.getMessages(ctx);
    const userId = BigInt(ctx.from.id);

    const exams = await this.examsRepo.getRecentCompletedExams(userId, this.limit);

    if (exams.length === 0) {
      await ctx.reply(messages.commandStatisticsEmpty);
      return;
    }

    let message = `${messages.commandStatisticsTitle}\n\n`;

    for (let i = 0; i < exams.length; i++) {
      const exam = exams[i];
      const date = exam.createdAt.toLocaleDateString(ctx.locale === 'ru' ? 'ru-RU' : 'en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const score = exam.score ?? 0;
      const maxScore = exam.maxScore ?? 0;

      let formattedFeedback = exam.feedback ?? '';

      if (formattedFeedback.startsWith('{')) {
        try {
          const parsed = JSON.parse(formattedFeedback) as { feedback?: string };
          if (parsed.feedback) {
            formattedFeedback = messages.examStatisticsBody({ feedback: parsed.feedback });
          }
        } catch {
          // Fallback to raw string if parsing fails
        }
      }

      const nextItem = `${messages.commandStatisticsItem(i + 1, date, score, maxScore, formattedFeedback)}\n\n`;

      if (message.length + nextItem.length > MAX_OUTBOUND_MESSAGE_CHARS) {
        const hiddenCount = exams.length - i;
        message += messages.commandStatisticsMoreExams(hiddenCount);
        break;
      }

      message += nextItem;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  }
}
