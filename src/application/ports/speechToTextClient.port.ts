/**
 * Speech-to-text transcription contract (OpenAI Whisper, xAI REST STT, etc.).
 */

export type SpeechToTextTranscriptionParams = {
  readonly audio: Buffer;
  /** Filename with extension hint for the provider (e.g. voice.oga). */
  readonly filename: string;
  /**
   * ISO 639-1 code when the caller can infer it (e.g. from Telegram UI locale).
   * Used by providers that support language hints (xAI STT with inverse text normalization).
   */
  readonly language?: string;
};

export interface ISpeechToTextClient {
  transcribe(params: SpeechToTextTranscriptionParams): Promise<string>;
}
