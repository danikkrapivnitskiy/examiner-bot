import { injectable, inject } from 'tsyringe';
import { sttTelegramVoiceAttachmentFilename } from '../../config/stt.constants';
import type { ISpeechToTextClient } from '../ports/speechToTextClient.port';
import type { IFileDownloader } from '../ports/fileDownloader.port';
import type { IAppLogger } from '../ports/logger.port';

export type ProcessVoiceAnswerParams = {
  userId: number;
  fileId: string;
  locale: string;
};

@injectable()
export class ProcessVoiceAnswerUseCase {
  constructor(
    @inject('ISpeechToTextClient') private readonly speechToText: ISpeechToTextClient,
    @inject('IFileDownloader') private readonly fileDownloader: IFileDownloader,
    @inject('IAppLogger') private readonly logger: IAppLogger
  ) {}

  async execute(params: ProcessVoiceAnswerParams): Promise<{ transcript: string }> {
    const audio = await this.fileDownloader.downloadFile(params.fileId);

    try {
      const transcript = (
        await this.speechToText.transcribe({
          audio,
          filename: sttTelegramVoiceAttachmentFilename,
          language: params.locale === 'ru' ? 'ru' : 'en',
        })
      ).trim();

      return { transcript };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn('Speech transcription failed', { userId: params.userId, error: errMsg });
      throw error;
    }
  }
}
