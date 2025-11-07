/* eslint-disable @typescript-eslint/naming-convention */

/** Prefix for ioredis {@link Redis.options.keyPrefix} to isolate keys from other apps on shared Redis. */
export const REDIS_KEY_PREFIX = 'examiner:';

// Redis Connection Constants
export const REDIS_MAX_RETRIES = 10;
export const REDIS_RETRY_DELAY_MULTIPLIER = 100; // ms
export const REDIS_RETRY_MAX_DELAY_MS = 3000; // ms
export const REDIS_COMMAND_TIMEOUT_MS = 5000; // ms
export const REDIS_HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// BullMQ Queue Constants
export const QUEUE_JOB_AGE_COMPLETED = 3600; // 1 hour
export const QUEUE_JOB_COUNT_COMPLETED = 1000;
export const QUEUE_JOB_AGE_FAILED = 86400; // 24 hours
export const QUEUE_JOB_ATTEMPTS = 1;
export const QUEUE_JOB_BACKOFF_DELAY = 2000; // ms
