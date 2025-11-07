import type { Bot } from 'grammy';

import { getExaminerMessages } from '../../config/i18n';
import type { BotContext } from '../context';
import { processExamAnswerFromUserText, type ExamAnswerHandlerDeps } from './examAnswerShared';
import type { ProcessVoiceAnswerUseCase } from '../../application/useCases/processVoiceAnswer.useCase';

import { QUOTA_DAILY_TUTOR_MESSAGES, QUOTA_DAILY_AUDIO_SECONDS } from '../../config/quota.constants';
import { QuotaType } from '../../domain/quota/quota.types';

export type VoiceHandlerDeps = ExamAnswerHandlerDeps & {
  processVoiceAnswer: ProcessVoiceAnswerUseCase | null;
};

/**
 * Handles voice replies during an active exam: transcribe, then reuse the text-answer pipeline.
 * Audio beyond one minute is truncated before STT (`trimAudioBufferForStt` / ffmpeg).
 */
export function registerVoiceHandler(bot: Bot<BotContext>, deps: VoiceHandlerDeps): void {
  bot.on('message:voice', async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const locale = ctx.locale;
    const examinerMessages = getExaminerMessages(locale);

    const userId = ctx.from.id;
    const updateId = ctx.update.update_id;

    // Check if this update was already processed (idempotency for webhook retries)
    if (updateId) {
      const isProcessed = await deps.userLock.checkMessageProcessed(userId, updateId);
      if (isProcessed) {
        deps.logger.debug('Ignoring duplicate update from Telegram', { userId, updateId });
        return; // Don't call next(), just end execution
      }
    }

    // First, check if state exists without acquiring lock to avoid blocking non-exam messages
    let state = await deps.examSessions.getExamState(userId);
    if (!state) {
      return;
    }

    const dbUser = await ctx.getOrCreateDbUser().catch(() => null);
    if (!dbUser || !ctx.from) {
      return;
    }

    const dbUserId = dbUser.id;

    // Acquire lock to prevent race conditions
    const lockAcquired = await deps.userLock.acquireLock(userId, 120);
    if (!lockAcquired) {
      await ctx.reply(examinerMessages.processingInProgress);
      return;
    }

    try {
      // Fetch state again after acquiring lock to ensure it hasn't changed
      state = await deps.examSessions.getExamState(userId);
      if (!state) {
        return;
      }

      if (!deps.evaluateAnswer) {
        await ctx.reply(examinerMessages.answerCheckingUnavailable);
        return;
      }

      if (!deps.processVoiceAnswer) {
        await ctx.reply(examinerMessages.answerCheckingUnavailable);
        return;
      }

      const voiceDuration = ctx.message.voice?.duration || 0;

      // Check audio seconds quota
      const currentAudioSeconds = await deps.quotaRepo.incrementQuota(dbUserId, QuotaType.AUDIO_SECONDS, voiceDuration);
      if (currentAudioSeconds > QUOTA_DAILY_AUDIO_SECONDS) {
        await ctx.reply(
          examinerMessages.dailyAudioLimitReached ||
            'You have reached your daily limit for voice messages. Please use text instead.'
        );
        return;
      }

      // Check tutor messages quota
      const currentMessages = await deps.quotaRepo.incrementQuota(dbUserId, QuotaType.TUTOR_MESSAGES, 1);
      if (currentMessages > QUOTA_DAILY_TUTOR_MESSAGES) {
        await ctx.reply(
          examinerMessages.dailyTutorLimitReached ||
            'You have reached your daily limit for tutor messages. Please come back tomorrow!'
        );
        return;
      }

      const fileId = ctx.message.voice?.file_id;
      if (!fileId) {
        await ctx.reply(examinerMessages.processingAnswerError);
        return;
      }

      try {
        const { transcript } = await deps.processVoiceAnswer.execute({
          userId,
          fileId,
          locale,
        });

        if (transcript.length === 0) {
          await ctx.reply(examinerMessages.speechRecognitionFailed);
          return;
        }

        await processExamAnswerFromUserText({
          ctx,
          deps,
          userId,
          dbUserId,
          state,
          userAnswer: transcript,
          locale,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        deps.logger.error('Voice exam handler failed', { userId, error: message });
        await ctx.reply(examinerMessages.processingAnswerError);
      }
    } finally {
      await deps.userLock.releaseLock(userId);
    }
  });
}
