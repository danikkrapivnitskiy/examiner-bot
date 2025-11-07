/* eslint-disable @typescript-eslint/naming-convention */
/** Base URL for xAI's OpenAI-compatible Chat Completions API. */
export const GROK_OPENAI_COMPAT_BASE_URL = 'https://api.x.ai/v1';

/** Base URL for Google Gemini's OpenAI-compatible API. */
export const GEMINI_OPENAI_COMPAT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

/** Base URL for OpenRouter API. */
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Default Title header for OpenRouter analytics. */
export const OPENROUTER_APP_TITLE = 'Examiner Bot';

/** Structured JSON extraction for material chunks and question bank (first attempt). */
export const examPipelineJsonLlmFirstAttempt = {
  temperature: 0.1,
  maxTokens: 8192,
} as const;

/** Repair pass after invalid JSON from the model. */
export const examPipelineJsonLlmRepairAttempt = {
  temperature: 0,
  maxTokens: 8192,
} as const;

/** Streaming graded feedback + verdict block for one exam answer. */
export const examAnswerEvaluationLlm = {
  maxTokens: 600,
  temperature: 0.2,
} as const;

/** Final exam summary JSON after session completes. */
export const examFinalReportLlm = {
  maxTokens: 600,
  temperature: 0.45,
} as const;
