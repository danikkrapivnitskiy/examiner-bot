import { type OpenAI, toFile } from 'openai';

import type {
  ISpeechToTextClient,
  SpeechToTextTranscriptionParams,
} from '../../application/ports/speechToTextClient.port';
import { trimAudioBufferForStt } from '../audio/trimAudioForStt';

/**
 * OpenAI Whisper speech-to-text via HTTP REST (`audio.transcriptions.create`).
 * Whisper is not offered as a WebSocket stream by OpenAI; clients POST multipart audio like any REST upload.
 */
export class OpenAiSpeechToTextClient implements ISpeechToTextClient {
  constructor(
    private readonly client: OpenAI,
    private readonly model: string = 'whisper-1'
  ) {}

  async transcribe(params: SpeechToTextTranscriptionParams): Promise<string> {
    const trimmed = await trimAudioBufferForStt(params.audio, params.filename);
    const file = await toFile(trimmed.buffer, trimmed.filename);
    const result = await this.client.audio.transcriptions.create({
      file,
      model: this.model,
    });
    return typeof result.text === 'string' ? result.text : '';
  }
}
