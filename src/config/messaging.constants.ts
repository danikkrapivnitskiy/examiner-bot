/** Telegram outbound body soft limit for split-safe replies. */
export const MAX_OUTBOUND_MESSAGE_CHARS = 3500;

/** Minimum interval between Telegram message edits while streaming LLM feedback (avoid HTTP 429). */
export const telegramStreamEditIntervalMs = 1600;

/** Telegram callback alert text limit — keep fallback shorter than this. */
export const telegramCallbackAlertMaxChars = 200;

/**
 * Truncates outbound Telegram text to {@link MAX_OUTBOUND_MESSAGE_CHARS} so replies stay within safe limits.
 */
export function clampOutboundReplyText(text: string): string {
  if (text.length <= MAX_OUTBOUND_MESSAGE_CHARS) {
    return text;
  }
  return `${text.slice(0, MAX_OUTBOUND_MESSAGE_CHARS - 1)}…`;
}
