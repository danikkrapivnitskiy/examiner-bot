import { promises as fs } from 'node:fs';
import { File } from 'node:buffer';
import path from 'node:path';

// @ts-ignore
globalThis.File = File;
import ffmpeg from 'fluent-ffmpeg';
import type { OpenAI } from 'openai';

import { ProcessVoiceAnswerUseCase } from '../src/application/useCases/processVoiceAnswer.useCase';
import { OpenAiSpeechToTextClient } from '../src/infrastructure/llm/openai-speechToText.client';
import { initializeExaminerFfmpeg } from '../src/infrastructure/media/ffmpeg.config';
import type { IFileDownloader } from '../src/application/ports/fileDownloader.port';
import type { IAppLogger } from '../src/application/ports/logger.port';
import { sttMaxAudioDurationSeconds } from '../src/config/stt.constants';

const getDurationSeconds = (filePath: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format?.duration ?? 0);
    });
  });
};

describe('ProcessVoiceAnswerUseCase (Integration)', () => {
  it('должен скачивать длинный файл, обрезать его и отправлять в STT', async () => {
    // 1. Подготавливаем мок-зависимости
    const filePath = path.join(__dirname, 'data', 'Synthwave goose - Blade Runner 2049.mp3');
    const originalBuffer = await fs.readFile(filePath);

    const mockFileDownloader: IFileDownloader = {
      downloadFile: jest.fn().mockResolvedValue(originalBuffer),
      downloadToDisk: jest.fn().mockResolvedValue(undefined),
    };

    const mockLogger: IAppLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Инициализируем пути к ffmpeg/ffprobe (важно для CI, где может не быть системного ffmpeg)
    initializeExaminerFfmpeg(mockLogger);

    // Мокаем OpenAI клиент, чтобы перехватить отправляемый файл
    let interceptedFile: any = null;
    const mockOpenAi = {
      audio: {
        transcriptions: {
          create: jest.fn().mockImplementation(async (params) => {
            interceptedFile = params.file;
            return { text: 'Моковый транскрипт' };
          }),
        },
      },
    } as unknown as OpenAI;

    const sttClient = new OpenAiSpeechToTextClient(mockOpenAi);

    const useCase = new ProcessVoiceAnswerUseCase(sttClient, mockFileDownloader, mockLogger);

    // 2. Выполняем UseCase
    const result = await useCase.execute({
      userId: 123,
      fileId: 'mock_file_id',
      locale: 'ru',
    });

    // 3. Проверяем, что UseCase вернул ожидаемый транскрипт
    expect(result.transcript).toBe('Моковый транскрипт');
    expect(mockFileDownloader.downloadFile).toHaveBeenCalledWith('mock_file_id');
    expect(mockOpenAi.audio.transcriptions.create).toHaveBeenCalled();

    // 4. Проверяем перехваченный файл
    expect(interceptedFile).toBeDefined();
    // Имя файла должно стать voice.wav, так как STT константа - 'voice.oga', и после обрезки оканчивается на .wav
    expect(interceptedFile.name).toBe('voice.wav');

    // 5. Сохраняем буфер из перехваченного файла и проверяем его реальную длительность
    const arrayBuffer = await interceptedFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const tempOutPath = path.join(__dirname, 'data', 'temp_test_output.wav');
    await fs.writeFile(tempOutPath, buffer);

    try {
      const duration = await getDurationSeconds(tempOutPath);
      
      // Длительность должна быть обрезана до sttMaxAudioDurationSeconds (60 секунд)
      expect(duration).toBeLessThanOrEqual(sttMaxAudioDurationSeconds + 0.5);
      expect(duration).toBeGreaterThanOrEqual(sttMaxAudioDurationSeconds - 0.5);
    } finally {
      // Обязательно удаляем временный файл после теста
      await fs.unlink(tempOutPath).catch(() => {});
    }
  }, 30000); // Таймаут 30 секунд для ffmpeg
});
