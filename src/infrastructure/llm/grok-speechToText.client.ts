import type {
  ISpeechToTextClient,
  SpeechToTextTranscriptionParams,
} from '../../application/ports/speechToTextClient.port';
import { GROK_OPENAI_COMPAT_BASE_URL } from '../../config/llm.constants';
import { trimAudioBufferForStt } from '../audio/trimAudioForStt';

const grokSttUrl = `${GROK_OPENAI_COMPAT_BASE_URL}/stt`;

/**
 * xAI Grok speech-to-text via REST (`POST /v1/stt`). Multipart upload; `file` is appended last per API requirement.
 */
export class GrokSpeechToTextClient implements ISpeechToTextClient {
  constructor(private readonly apiKey: string) {}

  async transcribe(params: SpeechToTextTranscriptionParams): Promise<string> {
    const trimmed = await trimAudioBufferForStt(params.audio, params.filename);

    const formData = new FormData();
    // `format=true` enables inverse text normalization but requires `language` (400 otherwise).
    if (params.language) {
      formData.append('format', 'true');
      formData.append('language', params.language);
    }

    const blob = new Blob([new Uint8Array(trimmed.buffer)]);
    formData.append('file', blob, trimmed.filename);

    const response = await fetch(grokSttUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    const rawBody = await response.text();
    if (!response.ok) {
      throw new Error(`Grok STT request failed (${response.status}): ${rawBody}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody) as unknown;
    } catch {
      throw new Error(`Grok STT returned non-JSON body: ${rawBody.slice(0, 200)}`);
    }

    if (typeof parsed !== 'object' || parsed === null || !('text' in parsed)) {
      throw new Error('Grok STT response missing text field');
    }

    const textField: unknown = parsed.text;
    return typeof textField === 'string' ? textField : '';
  }
}
