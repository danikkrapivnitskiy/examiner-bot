import { GrammyError } from 'grammy';
import type { IAppLogger } from '../application/ports/logger.port';

const RATE_LIMIT_ERROR_CODE = 429;
const MESSAGE_NOT_MODIFIED_ERROR_CODE = 400;

export interface ITelegramRetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  context?: Record<string, unknown>;
}

function isRateLimitError(error: unknown): error is GrammyError {
  return error instanceof GrammyError && error.error_code === RATE_LIMIT_ERROR_CODE;
}

function isMessageNotModifiedError(error: unknown): error is GrammyError {
  if (!(error instanceof GrammyError)) {
    return false;
  }
  return (
    error.error_code === MESSAGE_NOT_MODIFIED_ERROR_CODE &&
    (error.description?.includes('message is not modified') || error.message?.includes('message is not modified'))
  );
}

function getRetryAfter(error: GrammyError): number {
  const retryAfter = error.parameters?.retry_after;
  if (typeof retryAfter === 'number' && retryAfter > 0) {
    return retryAfter * 1000;
  }
  return 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Retries a Telegram API call with rate limit handling and exponential backoff
 */
export async function retryTelegramCall<T>(
  fn: () => Promise<T>,
  logger: IAppLogger,
  options: ITelegramRetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000, context = {} } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (isMessageNotModifiedError(error)) {
        // Not a real error, message is already up to date
        return undefined as T;
      }

      if (isRateLimitError(error)) {
        const retryAfter = getRetryAfter(error);
        if (retryAfter > 0) {
          logger.warn('Telegram rate limit hit, retrying after specified delay', {
            ...context,
            attempt: attempt + 1,
            retryAfter,
          });
          await sleep(retryAfter);
          continue;
        }
      }

      if (attempt < maxRetries) {
        // Exponential backoff: baseDelay * 2^attempt
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        // Add jitter (±20%)
        const jitter = delay * 0.2 * (Math.random() - 0.5);
        const finalDelay = Math.max(0, delay + jitter);

        logger.debug('Telegram API call failed, retrying with backoff', {
          ...context,
          attempt: attempt + 1,
          delay: finalDelay,
          error: lastError.message,
        });

        await sleep(finalDelay);
        continue;
      }

      logger.error('Telegram API call failed after all retries', {
        ...context,
        attempts: attempt + 1,
        error: lastError.message,
      });

      throw lastError;
    }
  }

  throw lastError ?? new Error('Unexpected error in retryTelegramCall');
}
