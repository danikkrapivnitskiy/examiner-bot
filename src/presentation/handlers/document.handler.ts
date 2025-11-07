import { InlineKeyboard, type Bot } from 'grammy';
import { CallbackAction } from '../../config/bot-commands.enum';

import { getExaminerMessages } from '../../config/i18n';
import { MAX_DOCUMENT_BYTES } from '../../config/upload.constants';
import { detectMaterialKind } from '../../domain/material/materialKind';
import { UploadDocumentUseCase, UploadDocumentError } from '../../application/useCases/uploadDocument.useCase';
import type { BotContext } from '../context';
import { env } from '../../config/env';
import { AppEdition } from '../../config/app-edition.enum';
import type { IAppLogger } from '../../application/ports/logger.port';
import type { IQuotaRepository } from '../../application/ports/quotaRepository.port';
import { QUOTA_DAILY_EXAMS_GENERATED } from '../../config/quota.constants';
import { QuotaType } from '../../domain/quota/quota.types';

export type DocumentHandlerDeps = {
  uploadDocument: UploadDocumentUseCase;
  logger: IAppLogger;
  quotaRepo: IQuotaRepository;
};

/**
 * Registers the document upload pipeline: validation, balance check, Exam row, and background AI preparation.
 */
export function registerDocumentHandler(bot: Bot<BotContext>, deps: DocumentHandlerDeps): void {
  bot.on('message:document', async (ctx, next) => {
    const doc = ctx.message.document;
    if (!doc) {
      return next();
    }

    const locale = ctx.locale;
    const examinerMessages = getExaminerMessages(locale);

    const dbUser = await ctx.getOrCreateDbUser().catch(() => null);
    if (!dbUser) {
      await ctx.reply(examinerMessages.userProfileUnavailable);
      return;
    }

    const kind = detectMaterialKind(doc.file_name, doc.mime_type);
    if (!kind) {
      await ctx.reply(examinerMessages.unsupportedMaterial);
      return;
    }

    const size = doc.file_size;
    const mbLimit = MAX_DOCUMENT_BYTES / (1024 * 1024);
    if (size !== undefined && size > MAX_DOCUMENT_BYTES) {
      await ctx.reply(examinerMessages.fileTooLargeMb(mbLimit));
      return;
    }

    if (env.appEdition !== AppEdition.COMMUNITY) {
      if (!dbUser.subscriptionEndDate || dbUser.subscriptionEndDate < new Date()) {
        const keyboard = new InlineKeyboard()
          .text(examinerMessages.referralMenuButton, CallbackAction.OPEN_REFERRAL_MENU)
          .text(examinerMessages.paymentMenuButton, CallbackAction.OPEN_PAYMENTS_MENU);
        await ctx.reply(examinerMessages.insufficientExamCredits, { reply_markup: keyboard });
        return;
      }

      // Check daily exams generated quota
      const currentExamsGenerated = await deps.quotaRepo.incrementQuota(dbUser.id, QuotaType.EXAMS_GENERATED, 1);
      if (currentExamsGenerated > QUOTA_DAILY_EXAMS_GENERATED) {
        await ctx.reply(
          examinerMessages.dailyExamsLimitReached ||
            'You have reached your daily limit for generating exams. Please try again tomorrow.'
        );
        return;
      }
    }

    const chatId = ctx.chat?.id;
    if (chatId === undefined) {
      await ctx.reply(examinerMessages.couldNotResolveChat);
      return;
    }

    try {
      const result = await deps.uploadDocument.execute({
        chatId,
        userId: dbUser.id,
        fileId: doc.file_id,
        originalFileName: doc.file_name,
        mimeType: doc.mime_type,
        locale,
      });

      if (!result.ok) {
        if (env.appEdition !== AppEdition.COMMUNITY) {
          await deps.quotaRepo.incrementQuota(dbUser.id, QuotaType.EXAMS_GENERATED, -1);
        }
        if (result.error === UploadDocumentError.LLM_NOT_CONFIGURED) {
          await ctx.reply(examinerMessages.examGenerationNotConfigured);
        } else if (result.error === UploadDocumentError.INSUFFICIENT_CREDITS) {
          const keyboard = new InlineKeyboard()
            .text(examinerMessages.referralMenuButton, CallbackAction.OPEN_REFERRAL_MENU)
            .text(examinerMessages.paymentMenuButton, CallbackAction.OPEN_PAYMENTS_MENU);
          await ctx.reply(examinerMessages.insufficientExamCredits, { reply_markup: keyboard });
        }
        return;
      }

      await ctx.reply(examinerMessages.analyzingMaterials);
    } catch (error) {
      deps.logger.error('Document upload error', { error: String(error) });
      if (env.appEdition !== AppEdition.COMMUNITY) {
        await deps.quotaRepo.incrementQuota(dbUser.id, QuotaType.EXAMS_GENERATED, -1);
      }
      await ctx.reply(examinerMessages.documentUploadError);
    }
  });
}
