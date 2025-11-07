import { injectable, inject } from 'tsyringe';
import IORedis from 'ioredis';
import type { IAppLogger } from '../../application/ports/logger.port';
import { env } from '../../config/env';
import {
  REDIS_MAX_RETRIES,
  REDIS_RETRY_DELAY_MULTIPLIER,
  REDIS_RETRY_MAX_DELAY_MS,
  REDIS_HEALTH_CHECK_INTERVAL_MS,
} from '../../config/redis.constants';
import type { IQueueRedisConnectionProvider } from '../../application/ports/queueRedisConnectionProvider.port';

@injectable()
export class QueueRedisConnectionProvider implements IQueueRedisConnectionProvider {
  private connection: IORedis | null = null;
  private refCount = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(@inject('IAppLogger') private readonly logger: IAppLogger) {}

  async getConnection(): Promise<IORedis> {
    if (!this.connection) {
      this.logger.info('Creating shared IORedis connection for BullMQ');

      this.connection = new IORedis(env.REDIS_URL, {
        maxRetriesPerRequest: null, // Required for BullMQ
        enableReadyCheck: false, // Required for BullMQ
        lazyConnect: true,
        connectTimeout: 10000,
        keepAlive: 10000,
        // Do NOT set commandTimeout for BullMQ connections, as workers use blocking commands (e.g., BRPOPLPUSH)
        // that will intentionally wait for jobs. Setting a timeout causes "Command timed out" errors.
        retryStrategy: (times) => {
          if (times > REDIS_MAX_RETRIES) {
            this.logger.error('Redis connection retry limit reached for queue pool');
            return null;
          }
          const delay = Math.min(times * REDIS_RETRY_DELAY_MULTIPLIER, REDIS_RETRY_MAX_DELAY_MS);
          this.logger.warn('Retrying Redis connection for queue pool', {
            attempt: times,
            delayMs: delay,
          });
          return delay;
        },
      });

      this.connection.on('error', (error) => {
        this.logger.error('Queue Redis connection error', {
          error: error instanceof Error ? error.message : String(error),
        });
      });

      this.connection.on('ready', () => {
        this.logger.info('Queue Redis connection ready');
      });

      this.connection.on('close', () => {
        this.logger.warn('Queue Redis connection closed');
      });

      const connectPromise = this.connection.connect();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Redis connection timeout (10000ms)')), 10000);
      });

      await Promise.race([connectPromise, timeoutPromise]);
      this.logger.info('Shared IORedis connection established for BullMQ');

      // Application-level Health Check
      this.healthCheckInterval = setInterval(() => {
        void (async () => {
          try {
            if (this.connection?.status === 'ready') {
              const startTime = Date.now();
              await this.connection.ping();
              const duration = Date.now() - startTime;
              this.logger.debug('Queue Redis health check passed', { duration, status: 'healthy' });
            }
          } catch (error) {
            this.logger.warn('Queue Redis health check failed', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })();
      }, REDIS_HEALTH_CHECK_INTERVAL_MS);
    }

    this.refCount++;
    this.logger.debug('IORedis connection acquired', { refCount: this.refCount });
    return this.connection;
  }

  async releaseConnection(): Promise<void> {
    if (this.refCount <= 0) {
      this.logger.warn('releaseConnection called when refCount is already 0', {
        refCount: this.refCount,
      });
      return;
    }
    this.refCount--;
    this.logger.debug('IORedis connection released', { refCount: this.refCount });

    if (this.refCount === 0 && this.connection) {
      this.logger.info('Closing shared IORedis connection');
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }
      await this.connection.quit();
      this.connection = null;
    }
  }

  getRefCount(): number {
    return this.refCount;
  }

  hasConnection(): boolean {
    return this.connection !== null;
  }
}
