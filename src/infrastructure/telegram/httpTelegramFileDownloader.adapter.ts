import { injectable, inject } from 'tsyringe';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { IFileDownloader } from '../../application/ports/fileDownloader.port';

@injectable()
export class HttpTelegramFileDownloader implements IFileDownloader {
  constructor(
    @inject('TELEGRAM_BOT_TOKEN') private readonly botToken: string,
    @inject('TELEGRAM_API_URL') private readonly telegramApiUrl: string = 'https://api.telegram.org'
  ) {}

  private async resolveFilePath(fileId: string): Promise<string> {
    const url = `${this.telegramApiUrl}/bot${this.botToken}/getFile?file_id=${fileId}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Telegram getFile failed with HTTP ${response.status}`);
    }
    /* eslint-disable @typescript-eslint/naming-convention */
    const data = (await response.json()) as { ok: boolean; result?: { file_path?: string } };
    /* eslint-enable @typescript-eslint/naming-convention */
    if (!data.ok || !data.result?.file_path) {
      throw new Error('Telegram getFile returned invalid response');
    }
    return data.result.file_path;
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const filePath = await this.resolveFilePath(fileId);
    const url = `${this.telegramApiUrl}/file/bot${this.botToken}/${filePath}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Telegram file download failed with HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async downloadToDisk(fileId: string, destPath: string): Promise<void> {
    const filePath = await this.resolveFilePath(fileId);
    const url = `${this.telegramApiUrl}/file/bot${this.botToken}/${filePath}`;
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Telegram file download failed with HTTP ${response.status}`);
    }
    // fetch body in Node is a stream
    await pipeline(response.body as unknown as NodeJS.ReadableStream, createWriteStream(destPath));
  }
}
