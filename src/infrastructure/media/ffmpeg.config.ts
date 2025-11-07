/**
 * FFmpeg / FFprobe binary resolution (same priority as tg-ai-friend-bot):
 * system binaries from PATH first, then ffmpeg-static / ffprobe-static.
 */

import { execSync } from 'node:child_process';

import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import ffprobePath from 'ffprobe-static';

import type { IAppLogger } from '../../application/ports/logger.port';

let configured = false;

function configureFfmpeg(logger: IAppLogger): void {
  let ffmpegSystemPath: string | null = null;
  try {
    execSync('which ffmpeg', { stdio: 'ignore' });
    ffmpegSystemPath = 'ffmpeg';
    logger.debug('Using system ffmpeg');
  } catch {
    logger.debug('System ffmpeg not found, using ffmpeg-static');
  }

  if (ffmpegSystemPath !== null) {
    ffmpeg.setFfmpegPath(ffmpegSystemPath);
  } else if (ffmpegPath !== null && ffmpegPath !== undefined && ffmpegPath !== '') {
    ffmpeg.setFfmpegPath(ffmpegPath);
  } else {
    logger.warn('Neither system ffmpeg nor ffmpeg-static is available');
  }
}

function configureFfprobe(logger: IAppLogger): void {
  let ffprobeSystemPath: string | null = null;
  try {
    execSync('which ffprobe', { stdio: 'ignore' });
    ffprobeSystemPath = 'ffprobe';
    logger.debug('Using system ffprobe');
  } catch {
    logger.debug('System ffprobe not found, using ffprobe-static');
  }

  if (ffprobeSystemPath !== null) {
    ffmpeg.setFfprobePath(ffprobeSystemPath);
  } else if (ffprobePath !== null) {
    ffmpeg.setFfprobePath(ffprobePath.path);
  } else {
    logger.warn('Neither system ffprobe nor ffprobe-static is available');
  }
}

/** Idempotent; safe to call before any fluent-ffmpeg usage. */
export function initializeExaminerFfmpeg(logger: IAppLogger): void {
  if (configured) {
    return;
  }
  configureFfmpeg(logger);
  configureFfprobe(logger);
  configured = true;
}
