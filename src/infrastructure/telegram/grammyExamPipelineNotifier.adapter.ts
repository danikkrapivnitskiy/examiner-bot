import { injectable, inject } from 'tsyringe';
import type { Api } from 'grammy';
import { InlineKeyboard } from 'grammy';

import type { ExaminerUiLocale } from '../../config/i18n/locale';
import { getExaminerMessages } from '../../config/i18n/dictionaries';
import type { IExamPipelineNotifier } from '../../application/ports/examPipelineNotifier.port';
import type { IAppLogger } from '../../application/ports/logger.port';

@injectable()
export class GrammyExamPipelineNotifier implements IExamPipelineNotifier {
  constructor(
    @inject('GrammyApi') private readonly api: Api,
    @inject('IAppLogger') private readonly logger: IAppLogger
  ) {}

  async notifyMaterialReady(chatId: number, examId: string, locale: ExaminerUiLocale): Promise<void> {
    const examinerMessages = getExaminerMessages(locale);
    const keyboard = new InlineKeyboard().text(examinerMessages.startExamButton, `exam:start:${examId}`);
    await this.api.sendMessage(
      chatId,
      [examinerMessages.materialReadyLine1, examinerMessages.materialReadyLine2].join('\n\n'),
      {
        reply_markup: keyboard,
      }
    );
  }

  async notifyUnsupportedMaterial(chatId: number, locale: ExaminerUiLocale): Promise<void> {
    const examinerMessages = getExaminerMessages(locale);
    await this.safeSend(chatId, examinerMessages.unsupportedMaterial);
  }

  async notifyMaterialTooLargeTokens(
    chatId: number,
    locale: ExaminerUiLocale,
    estimatedTokens: number,
    limit: number
  ): Promise<void> {
    const examinerMessages = getExaminerMessages(locale);
    await this.safeSend(chatId, examinerMessages.documentTooManyTokens(estimatedTokens, limit));
  }

  async notifyScannedDocument(chatId: number, locale: ExaminerUiLocale): Promise<void> {
    const examinerMessages = getExaminerMessages(locale);
    await this.safeSend(chatId, examinerMessages.scannedDocumentError);
  }

  async notifyGenericFailure(chatId: number, locale: ExaminerUiLocale): Promise<void> {
    const examinerMessages = getExaminerMessages(locale);
    await this.safeSend(chatId, examinerMessages.genericPipelineError);
  }

  private async safeSend(chatId: number, message: string): Promise<void> {
    try {
      await this.api.sendMessage(chatId, message);
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to send pipeline notification DM to user', { chatId, err });
    }
  }
}
