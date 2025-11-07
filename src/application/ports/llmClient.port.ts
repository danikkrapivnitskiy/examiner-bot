/**
 * Provider-agnostic LLM chat completion contract (OpenAI, Grok, etc.).
 */

export interface LlmChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface LlmCompletionOptions {
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly jsonMode?: boolean;
  readonly model?: string;
}

export interface LlmCompletionResult {
  readonly content: string;
  readonly finishReason: string | null;
}

export interface ILlmClient {
  generateChatCompletion(
    messages: readonly LlmChatMessage[],
    options?: LlmCompletionOptions
  ): Promise<LlmCompletionResult>;

  /**
   * Streams assistant content deltas (typically UTF-8 text). Implementations yield zero or more strings per chunk.
   */
  streamChatCompletion(messages: readonly LlmChatMessage[], options?: LlmCompletionOptions): AsyncIterable<string>;
}
