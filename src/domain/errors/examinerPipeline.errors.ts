import { BaseError } from './base.error';

/** LLM produced content that did not parse against the expected JSON schema after retry. */
export class LlmStructuredOutputError extends BaseError {
  constructor(label: string, message?: string) {
    super(message ?? `Invalid structured output from LLM for ${label}`, 'LLM_STRUCTURED_OUTPUT_ERROR', 500, { label });
  }

  getUserMessage(): string {
    return 'Failed to process AI output. Please try again.';
  }
}

/** Chunk merging produced no topics for the knowledge map. */
export class KnowledgeMapEmptyError extends BaseError {
  constructor(message = 'Knowledge map ended up empty after chunk analysis') {
    super(message, 'KNOWLEDGE_MAP_EMPTY', 500);
  }

  getUserMessage(): string {
    return 'Could not extract enough topics from the provided material.';
  }
}

/** Question bank generation returned no questions. */
export class QuestionBankEmptyError extends BaseError {
  constructor(message = 'Question bank was empty') {
    super(message, 'QUESTION_BANK_EMPTY', 500);
  }

  getUserMessage(): string {
    return 'Failed to generate questions from the material.';
  }
}
