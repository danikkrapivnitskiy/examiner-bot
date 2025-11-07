import { InlineKeyboard, type Context } from 'grammy';

import { clampOutboundReplyText, telegramStreamEditIntervalMs } from '../../config/messaging.constants';
import { CallbackAction } from '../../config/bot-commands.enum';
import { retryTelegramCall } from '../../utils/telegramRetry.util';
import { withTypingAction } from '../../utils/telegramChatAction.util';
import type { ExaminerUiLocale } from '../../config/i18n/locale';
import { getExaminerMessages } from '../../config/i18n';
import type {
  EvaluateExamAnswerUseCase,
  ExamEvaluationOutcome,
} from '../../application/useCases/evaluateExamAnswer.useCase';
import type { FinishExamUseCase } from '../../application/useCases/finishExam.useCase';
import type { LoadExamTurnContextUseCase } from '../../application/useCases/loadExamTurnContext.useCase';
import type { ManageExamSessionUseCase } from '../../application/useCases/manageExamSession.useCase';
import type { IUserLock } from '../../application/ports/userLock.port';
import type { StoredKnowledgePayload } from '../../application/exam/examKnowledge.schema';
import { formatExamQuestionMessage } from '../formatters/examQuestion.formatter';
import type { ExamState } from '../../domain/exam/examState.entity';
import type { IAppLogger } from '../../application/ports/logger.port';

import { ExamSessionService } from '../../application/exam/examSession.service';

import type { IStatisticsService } from '../../application/ports/statisticsService.port';
import type { IQuotaRepository } from '../../application/ports/quotaRepository.port';

export type ExamAnswerHandlerDeps = {
  examSessions: ManageExamSessionUseCase;
  examSessionService: ExamSessionService;
  userLock: IUserLock;
  evaluateAnswer: EvaluateExamAnswerUseCase | null;
  finishExam: FinishExamUseCase;
  loadExamTurn: LoadExamTurnContextUseCase;
  logger: IAppLogger;
  statisticsService: IStatisticsService;
  quotaRepo: IQuotaRepository;
};

export async function evaluateExamAnswerWithStreamingUi(params: {
  ctx: Context;
  logger: IAppLogger;
  evaluateAnswer: EvaluateExamAnswerUseCase;
  examParams: {
    question: string;
    idealAnswer: string;
    userAnswer: string;
    currentQuestionHistory?: { role: 'user' | 'assistant'; content: string }[];
  };
  locale: ExaminerUiLocale;
}): Promise<{ outcome: ExamEvaluationOutcome; messageId?: number }> {
  const { ctx, logger, evaluateAnswer, examParams, locale } = params;
  const examinerMessages = getExaminerMessages(locale);
  const chatId = ctx.chat?.id;
  if (chatId === undefined) {
    return { outcome: await evaluateAnswer.execute(examParams) };
  }

  const placeholderMessage = await retryTelegramCall(() => ctx.reply(clampOutboundReplyText('…')), logger);
  const messageId = placeholderMessage.message_id;

  let visible = '';
  let lastEditAt = 0;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  const applyEdit = async (text: string, replyMarkup?: InlineKeyboard): Promise<void> => {
    const body = clampOutboundReplyText(text.trim().length > 0 ? text.trim() : '…');
    try {
      await retryTelegramCall(
        () => ctx.api.editMessageText(chatId, messageId, body, { reply_markup: replyMarkup }),
        logger,
        {
          maxRetries: 2,
        }
      );
      lastEditAt = Date.now();
    } catch (error: unknown) {
      const description =
        error && typeof error === 'object' && 'description' in error
          ? String((error as { description?: unknown }).description)
          : '';
      if (description.includes('message is not modified')) {
        return;
      }
      logger.warn('Telegram editMessageText failed during streamed grading', { description });
    }
  };

  const scheduleTrailingEdit = (): void => {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
    }
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      void applyEdit(visible);
    }, telegramStreamEditIntervalMs);
  };

  const outcome = await evaluateAnswer.execute(examParams, {
    onFeedbackChunk: async (chunk: string): Promise<void> => {
      visible += chunk;
      const now = Date.now();
      if (now - lastEditAt >= telegramStreamEditIntervalMs) {
        if (pendingTimer !== null) {
          clearTimeout(pendingTimer);
          pendingTimer = null;
        }
        await applyEdit(visible);
      } else {
        scheduleTrailingEdit();
      }
    },
  });

  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }

  if (outcome.ok) {
    const finalFeedback = outcome.evaluation.feedback.trim();
    let keyboard: InlineKeyboard | undefined;

    if (outcome.evaluation.needsFollowUp) {
      keyboard = new InlineKeyboard().text(examinerMessages.nextQuestionButton, 'exam_next_question');
    }

    await applyEdit(finalFeedback.length > 0 ? finalFeedback : '…', keyboard);
  } else {
    await applyEdit(examinerMessages.gradingFailedShort);
  }

  return { outcome, messageId };
}

function questionFromPool(
  payload: StoredKnowledgePayload,
  poolIds: readonly string[],
  index: number
): StoredKnowledgePayload['questionBank'][number] | undefined {
  const id = poolIds[index];
  return payload.questionBank.find((questionItem) => questionItem.id === id);
}

/**
 * Shared pipeline: load turn context, evaluate answer with streaming UI, advance exam state.
 */
export async function processExamAnswerFromUserText(params: {
  ctx: Context;
  deps: ExamAnswerHandlerDeps;
  userId: number;
  dbUserId: bigint;
  state: ExamState;
  userAnswer: string;
  locale: ExaminerUiLocale;
}): Promise<void> {
  const { ctx, deps, userId, dbUserId, state, userAnswer, locale } = params;
  const examinerMessages = getExaminerMessages(locale);

  if (!deps.evaluateAnswer) {
    await retryTelegramCall(() => ctx.reply(examinerMessages.answerCheckingUnavailable), deps.logger);
    return;
  }

  if (
    state.currentIndex < 0 ||
    state.currentIndex >= state.questionPoolIds.length ||
    state.totalQuestions !== state.questionPoolIds.length
  ) {
    deps.logger.error('Corrupted exam state', { userId, currentIndex: state.currentIndex });
    await retryTelegramCall(() => ctx.reply(examinerMessages.examStateCorrupted), deps.logger);
    return;
  }

  if (state.lastQuestionMessageId) {
    try {
      await ctx.api.editMessageReplyMarkup(ctx.chat?.id ?? userId, state.lastQuestionMessageId, {
        reply_markup: undefined,
      });
    } catch {
      // Ignore if message was deleted or reply markup already removed
    }
    state.lastQuestionMessageId = undefined;
  }

  const questionId = state.questionPoolIds[state.currentIndex];

  try {
    const turn = await deps.loadExamTurn.execute({
      examId: state.examId,
      dbUserId,
      questionId,
    });

    if (!turn.ok) {
      await retryTelegramCall(() => ctx.reply(examinerMessages.materialNoLongerAvailable), deps.logger);
      return;
    }

    const { payload, examQuestion } = turn;

    const evaluationAndMsg = await withTypingAction(ctx, deps.logger, async () => {
      return evaluateExamAnswerWithStreamingUi({
        ctx,
        logger: deps.logger,
        evaluateAnswer: deps.evaluateAnswer!,
        examParams: {
          question: examQuestion.question,
          idealAnswer: examQuestion.idealAnswer,
          userAnswer,
          currentQuestionHistory: state.currentQuestionHistory,
        },
        locale,
      });
    });

    if (!evaluationAndMsg.outcome.ok) {
      deps.logger.warn('Exam evaluation failed', { userId, error: evaluationAndMsg.outcome.errorMessage });
      return;
    }

    const { evaluation: evalData } = evaluationAndMsg.outcome;

    const result = deps.examSessionService.processAnswer(state, evalData, examQuestion.topic);

    // Track question answered
    if (!result.needsFollowUp || result.isExamFinished) {
      await deps.statisticsService.trackQuestionAnswered(userId).catch(() => {});
    }

    // Save history if we are waiting for a follow-up
    if (result.needsFollowUp) {
      if (!state.currentQuestionHistory) {
        state.currentQuestionHistory = [];
      }
      state.currentQuestionHistory.push({ role: 'user', content: userAnswer });
      state.currentQuestionHistory.push({ role: 'assistant', content: evalData.feedback });

      if (evaluationAndMsg.messageId !== undefined) {
        state.lastQuestionMessageId = evaluationAndMsg.messageId;
      }
    }

    await deps.examSessions.setExamState(userId, state);

    if (result.isExamFinished) {
      let waitingMsgId: number | undefined;
      try {
        const waitingMsg = await retryTelegramCall(
          () => ctx.reply(examinerMessages.examReportIsBeingPrepared),
          deps.logger
        );
        waitingMsgId = waitingMsg.message_id;
      } catch (error) {
        deps.logger.warn('Failed to send waiting message, proceeding anyway', { error: String(error) });
      }

      try {
        const finishOutcome = await deps.finishExam.execute({
          telegramUserId: userId,
          dbUserId,
          state,
        });

        if (finishOutcome.ok) {
          let feedbackText =
            finishOutcome.report.isFallback && finishOutcome.report.fallbackLevel
              ? (examinerMessages[
                  `fallbackReco${finishOutcome.report.fallbackLevel.charAt(0).toUpperCase() + finishOutcome.report.fallbackLevel.slice(1)}` as keyof typeof examinerMessages
                ] as string)
              : finishOutcome.report.feedback;

          if (
            finishOutcome.report.isFallback &&
            finishOutcome.report.weakTopics &&
            finishOutcome.report.weakTopics.length > 0
          ) {
            feedbackText += `\n\n${examinerMessages.topicsToReviewLabel} ${finishOutcome.report.weakTopics.join(', ')}`;
          }

          const reportBody = examinerMessages.examCompleteReportBody({
            score: finishOutcome.report.score,
            feedback: feedbackText,
          });

          const keyboard = new InlineKeyboard().text(
            examinerMessages.startNewExamButton,
            CallbackAction.PROMPT_START_EXAM
          );

          await retryTelegramCall(
            () => ctx.reply(clampOutboundReplyText(reportBody), { parse_mode: 'HTML', reply_markup: keyboard }),
            deps.logger
          );
        } else {
          await retryTelegramCall(
            () => ctx.reply(examinerMessages.examCompleteSaveFailedMessage(''), { parse_mode: 'HTML' }),
            deps.logger
          );
        }
      } finally {
        if (waitingMsgId) {
          try {
            const chatId = ctx.chat?.id ?? userId;
            await ctx.api.deleteMessage(chatId, waitingMsgId);
          } catch (deleteError) {
            deps.logger.warn('Could not delete waiting message', { error: String(deleteError) });
          }
        }
      }
      return;
    }

    if (result.needsFollowUp) {
      // Still have attempts left, just wait for next answer
      return;
    }

    const nextQuestion = questionFromPool(payload, state.questionPoolIds, state.currentIndex);
    if (!nextQuestion) {
      deps.logger.error('Next exam question missing from bank', {
        examId: state.examId,
        nextId: state.questionPoolIds[state.currentIndex],
      });
      await retryTelegramCall(() => ctx.reply(examinerMessages.nextQuestionMissing), deps.logger);
      return;
    }

    const nextBody = formatExamQuestionMessage({
      questionNumber: state.currentIndex + 1,
      totalQuestions: state.totalQuestions,
      questionText: nextQuestion.question,
      locale,
    });

    const keyboard = new InlineKeyboard().text(examinerMessages.nextQuestionButton, 'exam_next_question');

    const sentMsg = await retryTelegramCall(
      () => ctx.reply(clampOutboundReplyText(nextBody), { reply_markup: keyboard }),
      deps.logger
    );

    state.lastQuestionMessageId = sentMsg.message_id;
    await deps.examSessions.setExamState(userId, state);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger.error('Exam answer handler failed', { userId, error: message });
    await retryTelegramCall(() => ctx.reply(examinerMessages.processingAnswerError), deps.logger);
  }
}
