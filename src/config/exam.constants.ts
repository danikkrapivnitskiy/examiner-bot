import { env } from './env';

export const examFallbackMidScoreFraction = 0.5;

/** Maximum number of messages to keep in the sliding window history for a single question. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const MAX_HISTORY_MESSAGES = env.MAX_HISTORY_MESSAGES;

/** Time-to-live for an active exam session in Redis (30 days in seconds) */
export const examStateTtlSeconds = 30 * 24 * 60 * 60;
