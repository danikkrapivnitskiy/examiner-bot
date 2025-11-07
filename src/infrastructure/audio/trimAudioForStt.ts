import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import ffmpeg from 'fluent-ffmpeg';

import {
  sttFfprobeRetryDelayMs,
  sttFileWriteDelayMs,
  sttMaxAudioDurationSeconds,
  sttMaxFfprobeAttempts,
  sttTruncationTimeoutMs,
} from '../../config/stt.constants';

export interface ISttTrimmedAudio {
  readonly buffer: Buffer;
  /** Filename for multipart uploads; `.wav` after PCM transcode used by tg-ai-friend-bot-style truncation. */
  readonly filename: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAudioDurationSeconds(filePath: string, maxAttempts: number = sttMaxFfprobeAttempts): Promise<number> {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const tryProbe = (): void => {
      attempts += 1;
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          if (attempts < maxAttempts) {
            setTimeout(tryProbe, sttFfprobeRetryDelayMs * attempts);
            return;
          }
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        resolve(metadata.format?.duration ?? 0);
      });
    };

    tryProbe();
  });
}

function truncateToWavPcm(inputPath: string, outputWavPath: string, maxSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Audio truncation timed out after ${sttTruncationTimeoutMs}ms`));
    }, sttTruncationTimeoutMs);

    ffmpeg(inputPath)
      .outputOptions(['-ss', '0', '-t', String(maxSeconds), '-acodec', 'pcm_s16le'])
      .format('wav')
      .on('end', () => {
        clearTimeout(timer);
        resolve();
      })
      .on('error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      })
      .save(outputWavPath);
  });
}

function uploadFilenameAfterWavTranscode(originalFilename: string): string {
  const base = path.basename(originalFilename, path.extname(originalFilename));
  const safeBase = base.length > 0 ? base : 'voice';
  return `${safeBase}.wav`;
}

/**
 * Limits audio length before STT (aligned with tg-ai-friend-bot `MediaService.truncateAudio`):
 * ffprobe duration check, skip if already within limit; otherwise PCM16 WAV via `-ss 0 -t N` after `-i`.
 */
export async function trimAudioBufferForStt(audio: Buffer, filename: string): Promise<ISttTrimmedAudio> {
  const ext = path.extname(filename);
  const safeExt = ext.length > 0 ? ext : '.oga';
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'examiner-stt-'));
  const inputPath = path.join(tmpDir, `in${safeExt}`);
  const outputWavPath = path.join(tmpDir, 'out.wav');

  try {
    await fs.writeFile(inputPath, audio);
    await sleep(sttFileWriteDelayMs);

    try {
      const duration = await getAudioDurationSeconds(inputPath);
      if (duration > 0 && duration <= sttMaxAudioDurationSeconds) {
        return { buffer: audio, filename };
      }
    } catch {
      // If probing fails, attempt truncation anyway (ffmpeg can still cap duration).
    }

    try {
      await truncateToWavPcm(inputPath, outputWavPath, sttMaxAudioDurationSeconds);
      const out = await fs.readFile(outputWavPath);
      return { buffer: out, filename: uploadFilenameAfterWavTranscode(filename) };
    } catch {
      return { buffer: audio, filename };
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
