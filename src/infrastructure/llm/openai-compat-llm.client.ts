import OpenAI from 'openai';

import type {
  ILlmClient,
  LlmChatMessage,
  LlmCompletionOptions,
  LlmCompletionResult,
} from '../../application/ports/llmClient.port';
import type { IAppLogger } from '../../application/ports/logger.port';

export interface OpenAiCompatClientConfig {
  readonly client: OpenAI;
  readonly defaultModel: string;
  readonly logger: IAppLogger;
  readonly providerName: string;
  readonly maxAttempts?: number;
}

/**
 * A universal LLM client that works with any OpenAI-compatible API (OpenAI, Grok, OpenRouter, etc.).
 * Adheres to the Dependency Inversion and Open/Closed principles by avoiding hardcoded provider logic.
 */
export class OpenAiCompatLlmClient implements ILlmClient {
  constructor(private readonly config: OpenAiCompatClientConfig) {}

  private isReasoningModel(model: string): boolean {
    const lower = model.toLowerCase();
    return lower.includes('deepseek-r1') || lower.includes('reasoning') || lower.startsWith('grok-4.3');
  }

  async generateChatCompletion(
    messages: readonly LlmChatMessage[],
    options?: LlmCompletionOptions
  ): Promise<LlmCompletionResult> {
    const maxAttempts = this.config.maxAttempts ?? 1;
    let lastError: unknown;
    const modelToUse = options?.model ?? this.config.defaultModel;

    this.config.logger.debug(`[${this.config.providerName}] Sending generateChatCompletion request`, {
      model: modelToUse,
      messagesCount: messages.length,
      jsonMode: options?.jsonMode,
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const startTime = Date.now();

        const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
          model: modelToUse,
          messages: [...messages] as OpenAI.Chat.ChatCompletionMessageParam[],
          max_tokens: options?.maxTokens ?? 4096,
          response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        };

        if (!this.isReasoningModel(modelToUse)) {
          params.temperature = options?.temperature ?? 0.2;
        }

        const completion = await this.config.client.chat.completions.create(params);

        const choice = completion.choices[0];
        let content = choice?.message?.content;

        // Fallback for some OpenRouter providers that erroneously place the JSON response in the reasoning field
        if (
          !content &&
          choice?.message &&
          'reasoning' in choice.message &&
          typeof (choice.message as Record<string, unknown>).reasoning === 'string'
        ) {
          content = (choice.message as Record<string, unknown>).reasoning as string;
        }

        const finalContent = content ?? '';

        this.config.logger.debug(`[${this.config.providerName}] Received generateChatCompletion response`, {
          model: modelToUse,
          durationMs: Date.now() - startTime,
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
          totalTokens: completion.usage?.total_tokens,
        });

        return {
          content: finalContent,
          finishReason: choice?.finish_reason ?? null,
        };
      } catch (error: unknown) {
        lastError = error;

        // Retry only on Rate Limit (429) or server errors (500+)
        const status =
          typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : undefined;
        const isRetryable = status === 429 || (status !== undefined && status >= 500);

        if (isRetryable && attempt < maxAttempts) {
          const delayMs = attempt * 2000;
          this.config.logger.warn(
            `[${this.config.providerName}] Error ${status}. Attempt ${attempt} of ${maxAttempts}. Waiting ${delayMs}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        this.config.logger.error(`[${this.config.providerName}] Request failed after ${attempt} attempts`, {
          status,
          error: String(error),
        });
        throw error;
      }
    }

    throw lastError;
  }

  async *streamChatCompletion(
    messages: readonly LlmChatMessage[],
    options?: LlmCompletionOptions
  ): AsyncIterable<string> {
    const modelToUse = options?.model ?? this.config.defaultModel;

    this.config.logger.debug(`[${this.config.providerName}] Starting streamChatCompletion`, {
      model: modelToUse,
      messagesCount: messages.length,
    });

    const startTime = Date.now();
    let chunkCount = 0;

    const params: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model: modelToUse,
      messages: [...messages] as OpenAI.Chat.ChatCompletionMessageParam[],
      max_tokens: options?.maxTokens ?? 4096,
      stream: true,
    };

    if (!this.isReasoningModel(modelToUse)) {
      params.temperature = options?.temperature ?? 0.2;
    }

    const stream = await this.config.client.chat.completions.create(params);

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta.length > 0) {
        chunkCount++;
        yield delta;
      }
    }

    this.config.logger.debug(`[${this.config.providerName}] Finished streamChatCompletion`, {
      model: modelToUse,
      durationMs: Date.now() - startTime,
      chunksYielded: chunkCount,
    });
  }
}
