import { env } from './env';

/** Maximum seconds of audio sent to Whisper; longer clips are trimmed before transcription. */
export const sttMaxAudioDurationSeconds = env.MAX_AUDIO_DURATION_SECONDS;

/** Filename hint passed to STT providers for Telegram voice (.oga) payloads. */
export const sttTelegramVoiceAttachmentFilename = 'voice.oga';

/** Delay after writing temp audio before ffprobe (aligned with tg-ai-friend-bot media service). */
export const sttFileWriteDelayMs = 100;

/** Hard cap on ffmpeg truncation run time for STT prep. */
export const sttTruncationTimeoutMs = 10_000;

export const sttMaxFfprobeAttempts = 3;

export const sttFfprobeRetryDelayMs = 200;
