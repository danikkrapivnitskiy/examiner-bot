import Redis from 'ioredis';
import {
  REDIS_KEY_PREFIX,
  REDIS_MAX_RETRIES,
  REDIS_RETRY_DELAY_MULTIPLIER,
  REDIS_RETRY_MAX_DELAY_MS,
  REDIS_COMMAND_TIMEOUT_MS,
  REDIS_HEALTH_CHECK_INTERVAL_MS,
} from '../../config/redis.constants';
import type { IAppLogger } from '../../application/ports/logger.port';

export interface IRedisClientOptions {
  withPrefix?: boolean;
}

export function createRedis(redisUrl: string, logger: IAppLogger, options?: IRedisClientOptions): Redis {
  const withPrefix = options?.withPrefix ?? true;

  const client = new Redis(redisUrl, {
    ...(withPrefix ? { keyPrefix: REDIS_KEY_PREFIX } : {}),
    maxRetriesPerRequest: null,
    commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
    retryStrategy: (times) => {
      if (times > REDIS_MAX_RETRIES) {
        logger.error('Redis connection retry limit reached');
        return null; // Stop retrying
      }
      const delay = Math.min(times * REDIS_RETRY_DELAY_MULTIPLIER, REDIS_RETRY_MAX_DELAY_MS);
      logger.warn('Retrying Redis connection', { attempt: times, delayMs: delay });
      return delay;
    },
  });

  client.on('error', (err: Error) => {
    logger.error('Redis client error', { message: err.message });
  });

  client.on('ready', () => {
    logger.info('Redis client created and ready', { keyPrefix: withPrefix ? REDIS_KEY_PREFIX : undefined });
  });

  // Application-level Health Check
  // Prevents idle connection timeouts by sending periodic PING commands
  const healthCheckInterval = setInterval(() => {
    void (async () => {
      try {
        if (client.status === 'ready') {
          const startTime = Date.now();
          await client.ping();
          const duration = Date.now() - startTime;
          logger.debug('Redis health check passed', { duration, status: 'healthy' });
        }
      } catch (error) {
        logger.warn('Redis health check failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }, REDIS_HEALTH_CHECK_INTERVAL_MS);

  // Ensure interval is cleared when client disconnects completely
  client.on('end', () => {
    clearInterval(healthCheckInterval);
    logger.warn('Redis client connection ended');
  });

  return client;
}
