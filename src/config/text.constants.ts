import { env } from './env';

/**
 * Rough chunk size for LLM passes (characters). Plan referenced ~2000–3000 tokens; ~8000 chars is a coarse upper proxy.
 */
export const TARGET_CHUNK_CHAR_LENGTH = 7500;

/**
 * Maximum estimated tokens allowed for a single document to prevent LLM context overflow.
 * Estimated as: Math.ceil(charCount / 2.5)
 */
export const MAX_DOCUMENT_ESTIMATED_TOKENS = env.MAX_DOCUMENT_ESTIMATED_TOKENS;

/**
 * Maximum text length in characters for user text messages.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const MAX_USER_TEXT_LENGTH = env.MAX_USER_TEXT_LENGTH;
