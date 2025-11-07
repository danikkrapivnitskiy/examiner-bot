/* eslint-disable @typescript-eslint/naming-convention */
import OpenAI from 'openai';

import type { Env } from '../../config/env';
import type { ILlmClient } from '../../application/ports/llmClient.port';
import type { ISpeechToTextClient } from '../../application/ports/speechToTextClient.port';
import type { IAppLogger } from '../../application/ports/logger.port';
import {
  GROK_OPENAI_COMPAT_BASE_URL,
  OPENROUTER_BASE_URL,
  OPENROUTER_APP_TITLE,
  GEMINI_OPENAI_COMPAT_BASE_URL,
} from '../../config/llm.constants';
import { OpenAiCompatLlmClient } from './openai-compat-llm.client';
import { GrokSpeechToTextClient } from './grok-speechToText.client';
import { OpenAiSpeechToTextClient } from './openai-speechToText.client';

type LlmClientBuilder = (env: Env, logger: IAppLogger) => ILlmClient | null;
type SttClientBuilder = (env: Env) => ISpeechToTextClient | null;

const llmBuilders: Record<string, LlmClientBuilder> = {
  openai: (env, logger) => {
    if (!env.OPENAI_API_KEY) {
      return null;
    }
    return new OpenAiCompatLlmClient({
      client: new OpenAI({ apiKey: env.OPENAI_API_KEY }),
      defaultModel: env.OPENAI_MODEL,
      logger,
      providerName: 'OpenAI',
      maxAttempts: 3,
    });
  },
  grok: (env, logger) => {
    if (!env.GROK_API_KEY) {
      return null;
    }
    const client = new OpenAI({
      apiKey: env.GROK_API_KEY,
      baseURL: GROK_OPENAI_COMPAT_BASE_URL,
    });
    return new OpenAiCompatLlmClient({
      client,
      defaultModel: env.GROK_MODEL,
      logger,
      providerName: 'Grok',
      maxAttempts: 3, // Added retries for Grok since the new unified client supports it
    });
  },
  openrouter: (env, logger) => {
    if (!env.OPENROUTER_API_KEY) {
      return null;
    }
    const client = new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': env.webhookUrl,
        'X-Title': OPENROUTER_APP_TITLE,
      },
    });
    return new OpenAiCompatLlmClient({
      client,
      defaultModel: env.OPENROUTER_MODEL,
      logger,
      providerName: 'OpenRouter',
      maxAttempts: 3,
    });
  },
  gemini: (env, logger) => {
    if (!env.geminiApiKey) {
      return null;
    }
    const client = new OpenAI({
      apiKey: env.geminiApiKey,
      baseURL: GEMINI_OPENAI_COMPAT_BASE_URL,
    });
    return new OpenAiCompatLlmClient({
      client,
      defaultModel: env.geminiModel,
      logger,
      providerName: 'Gemini',
      maxAttempts: 3,
    });
  },
};

const sttBuilders: Record<string, SttClientBuilder> = {
  openai: (env) => {
    if (!env.OPENAI_API_KEY) {
      return null;
    }
    return new OpenAiSpeechToTextClient(new OpenAI({ apiKey: env.OPENAI_API_KEY }), env.STT_MODEL);
  },
  grok: (env) => {
    if (!env.GROK_API_KEY) {
      return null;
    }
    return new GrokSpeechToTextClient(env.GROK_API_KEY);
  },
};

/**
 * Builds an {@link ILlmClient} from env using the registered builder strategy.
 * Returns null when the chosen provider has no API key.
 */
export function createLlmClient(env: Env, logger: IAppLogger): ILlmClient | null {
  const builder = llmBuilders[env.LLM_PROVIDER];
  return builder ? builder(env, logger) : null;
}

/**
 * Builds an {@link ISpeechToTextClient} from env using the registered builder strategy.
 */
export function createSpeechToTextClient(env: Env): ISpeechToTextClient | null {
  const builder = sttBuilders[env.sttProvider];
  return builder ? builder(env) : null;
}
