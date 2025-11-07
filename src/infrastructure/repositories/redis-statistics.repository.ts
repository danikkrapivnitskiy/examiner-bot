import { inject, injectable } from 'tsyringe';
import type { IAppLogger } from '../../application/ports/logger.port';
import type { IErrorSample, IStatisticsRepository } from '../../domain/repositories/statistics.repository';
import Redis from 'ioredis';

@injectable()
export class RedisStatisticsRepository implements IStatisticsRepository {
  private readonly keyPrefix = 'stats';
  private readonly paymentsOpenedKey = `${this.keyPrefix}:payments_opened`;
  private readonly examsCompletedKey = `${this.keyPrefix}:exams_completed`;
  private readonly questionsAnsweredKey = `${this.keyPrefix}:questions_answered`;
  private readonly errorCountKey = `${this.keyPrefix}:errors`;
  private readonly errorCountByTypeKey = `${this.keyPrefix}:errors:bytype`;
  private readonly errorSamplesKey = `${this.keyPrefix}:errors:samples`;
  private readonly topUsersKey = `${this.keyPrefix}:top_users`;
  private readonly activeUsersKey = `${this.keyPrefix}:active_users`;
  private readonly maxErrorSamplesPerDay = 200;

  constructor(
    @inject('Redis') private readonly redisClient: Redis,
    @inject('IAppLogger') private readonly logger: IAppLogger
  ) {}

  private getDailyKey(baseKey: string, timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${baseKey}:${year}-${month}-${day}`;
  }

  async incrementPaymentsOpened(timestamp?: number): Promise<void> {
    try {
      const now = timestamp ?? Math.floor(Date.now() / 1000);
      const key = this.getDailyKey(this.paymentsOpenedKey, now);
      await this.redisClient.incr(key);
      await this.redisClient.expire(key, 86400 * 30);
    } catch (error) {
      this.logger.error('Failed to increment payments opened count', { error });
    }
  }

  async getPaymentsOpened(startTimestamp: number, endTimestamp: number): Promise<number> {
    return this.getSumForDateRange(this.paymentsOpenedKey, startTimestamp, endTimestamp);
  }

  async incrementExamsCompleted(timestamp?: number): Promise<void> {
    try {
      const now = timestamp ?? Math.floor(Date.now() / 1000);
      const key = this.getDailyKey(this.examsCompletedKey, now);
      await this.redisClient.incr(key);
      await this.redisClient.expire(key, 86400 * 30);
    } catch (error) {
      this.logger.error('Failed to increment exams completed count', { error });
    }
  }

  async getExamsCompleted(startTimestamp: number, endTimestamp: number): Promise<number> {
    return this.getSumForDateRange(this.examsCompletedKey, startTimestamp, endTimestamp);
  }

  async incrementQuestionsAnswered(timestamp?: number): Promise<void> {
    try {
      const now = timestamp ?? Math.floor(Date.now() / 1000);
      const key = this.getDailyKey(this.questionsAnsweredKey, now);
      await this.redisClient.incr(key);
      await this.redisClient.expire(key, 86400 * 30);
    } catch (error) {
      this.logger.error('Failed to increment questions answered count', { error });
    }
  }

  async getQuestionsAnswered(startTimestamp: number, endTimestamp: number): Promise<number> {
    return this.getSumForDateRange(this.questionsAnsweredKey, startTimestamp, endTimestamp);
  }

  async incrementErrorCount(errorType: string, isCritical: boolean = false): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const errorKey = this.getDailyKey(this.errorCountKey, now);
      const errorByTypeKey = this.getDailyKey(this.errorCountByTypeKey, now);
      const ttl = 86400 * 7;

      await this.redisClient.incr(errorKey);
      await this.redisClient.expire(errorKey, ttl);

      const severityKey = isCritical ? `${errorKey}:critical` : `${errorKey}:warning`;
      await this.redisClient.incr(severityKey);
      await this.redisClient.expire(severityKey, ttl);

      await this.redisClient.zincrby(errorByTypeKey, 1, errorType);
      await this.redisClient.expire(errorByTypeKey, ttl);
    } catch (error) {
      this.logger.error('Failed to increment error count', { error, errorType });
    }
  }

  async getErrorCounts(
    startTimestamp: number,
    endTimestamp: number
  ): Promise<{
    total: number;
    critical: number;
    warnings: number;
    byType: Array<{ type: string; count: number }>;
  }> {
    try {
      const startDate = new Date(startTimestamp * 1000);
      const endDate = new Date(endTimestamp * 1000);
      const currentDate = new Date(startDate);

      const errorKeys: string[] = [];
      const criticalKeys: string[] = [];
      const warningKeys: string[] = [];
      const errorByTypeKeys: string[] = [];

      while (currentDate <= endDate) {
        const errorKey = this.getDailyKey(this.errorCountKey, Math.floor(currentDate.getTime() / 1000));
        const errorByTypeKey = this.getDailyKey(this.errorCountByTypeKey, Math.floor(currentDate.getTime() / 1000));

        errorKeys.push(errorKey);
        criticalKeys.push(`${errorKey}:critical`);
        warningKeys.push(`${errorKey}:warning`);
        errorByTypeKeys.push(errorByTypeKey);

        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }

      const pipeline = this.redisClient.multi();

      for (const key of errorKeys) {
        pipeline.get(key);
      }
      for (const key of criticalKeys) {
        pipeline.get(key);
      }
      for (const key of warningKeys) {
        pipeline.get(key);
      }
      for (const key of errorByTypeKeys) {
        pipeline.zrange(key, 0, -1, 'WITHSCORES');
      }

      const results = await pipeline.exec();
      if (!results) {
        return { total: 0, critical: 0, warnings: 0, byType: [] };
      }

      let total = 0;
      let critical = 0;
      let warnings = 0;
      const errorTypes = new Map<string, number>();

      const numDays = errorKeys.length;

      for (let i = 0; i < numDays; i++) {
        const [err, val] = results[i];
        if (!err && val && typeof val === 'string') {
          total += Number.parseInt(val, 10);
        }
      }

      for (let i = 0; i < numDays; i++) {
        const [err, val] = results[numDays + i];
        if (!err && val && typeof val === 'string') {
          critical += Number.parseInt(val, 10);
        }
      }

      for (let i = 0; i < numDays; i++) {
        const [err, val] = results[numDays * 2 + i];
        if (!err && val && typeof val === 'string') {
          warnings += Number.parseInt(val, 10);
        }
      }

      for (let i = 0; i < numDays; i++) {
        const [err, val] = results[numDays * 3 + i];
        if (!err && val && Array.isArray(val)) {
          const errorTypesForDay = val as string[];
          for (let j = 0; j < errorTypesForDay.length; j += 2) {
            const type = errorTypesForDay[j];
            const score = Number.parseFloat(errorTypesForDay[j + 1]);
            if (type && !Number.isNaN(score)) {
              const existing = errorTypes.get(type) ?? 0;
              errorTypes.set(type, existing + Math.round(score));
            }
          }
        }
      }

      const byType = Array.from(errorTypes.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

      return { total, critical, warnings, byType };
    } catch (error) {
      this.logger.error('Failed to get error counts', { error });
      return { total: 0, critical: 0, warnings: 0, byType: [] };
    }
  }

  async addErrorSample(sample: IErrorSample): Promise<void> {
    try {
      const key = this.getDailyKey(this.errorSamplesKey, Math.floor(sample.timestamp / 1000));
      const ttl = 86400 * 7;
      const payload = JSON.stringify(sample);

      await this.redisClient.lpush(key, payload);
      await this.redisClient.ltrim(key, 0, this.maxErrorSamplesPerDay - 1);
      await this.redisClient.expire(key, ttl);
    } catch (error) {
      this.logger.error('Failed to store error sample', { error, errorType: sample.name });
    }
  }

  async getErrorSamples(startTimestamp: number, endTimestamp: number, limit: number): Promise<IErrorSample[]> {
    try {
      const samples: IErrorSample[] = [];
      const startDate = new Date(startTimestamp * 1000);
      const endDate = new Date(endTimestamp * 1000);

      for (let current = new Date(startDate); current <= endDate; current.setUTCDate(current.getUTCDate() + 1)) {
        const key = this.getDailyKey(this.errorSamplesKey, Math.floor(current.getTime() / 1000));
        const entries = await this.redisClient.lrange(key, 0, limit - 1);
        for (const entry of entries) {
          try {
            samples.push(JSON.parse(entry) as IErrorSample);
          } catch {
            // Skip invalid entries
          }
        }
      }

      samples.sort((a, b) => b.timestamp - a.timestamp);
      return samples.slice(0, limit);
    } catch (error) {
      this.logger.error('Failed to get error samples', { error });
      return [];
    }
  }

  async updateTopUsers(userId: number, scoreIncrement: number, timestamp?: number): Promise<void> {
    try {
      const now = timestamp ?? Math.floor(Date.now() / 1000);
      const key = this.getDailyKey(this.topUsersKey, now);
      await this.redisClient.zincrby(key, scoreIncrement, String(userId));
      await this.redisClient.expire(key, 86400 * 30);
    } catch (error) {
      this.logger.error('Failed to update top users', { error });
    }
  }

  async getTopUsers(
    startTimestamp: number,
    endTimestamp: number,
    limit: number = 5
  ): Promise<Array<{ userId: number; score: number }>> {
    try {
      const startDate = new Date(startTimestamp * 1000);
      const endDate = new Date(endTimestamp * 1000);

      const userScores = new Map<number, number>();

      for (let current = new Date(startDate); current <= endDate; current.setUTCDate(current.getUTCDate() + 1)) {
        const key = this.getDailyKey(this.topUsersKey, Math.floor(current.getTime() / 1000));
        const results = await this.redisClient.zrange(key, 0, -1, 'WITHSCORES');

        for (let i = 0; i < results.length; i += 2) {
          const userId = Number.parseInt(results[i], 10);
          const score = Math.round(Number.parseFloat(results[i + 1]));
          userScores.set(userId, (userScores.get(userId) ?? 0) + score);
        }
      }

      return Array.from(userScores.entries())
        .map(([userId, score]) => ({ userId, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      this.logger.error('Failed to get top users', { error });
      return [];
    }
  }

  private async getSumForDateRange(baseKey: string, startTimestamp: number, endTimestamp: number): Promise<number> {
    try {
      const startDate = new Date(startTimestamp * 1000);
      const endDate = new Date(endTimestamp * 1000);
      const keys: string[] = [];

      for (let current = new Date(startDate); current <= endDate; current.setUTCDate(current.getUTCDate() + 1)) {
        keys.push(this.getDailyKey(baseKey, Math.floor(current.getTime() / 1000)));
      }

      const counts = await this.redisClient.mget(keys);

      let total = 0;
      for (const count of counts) {
        if (count) {
          total += Number.parseInt(count, 10);
        }
      }
      return total;
    } catch (error) {
      this.logger.error(`Failed to get sum for ${baseKey}`, { error });
      return 0;
    }
  }

  async recordActiveUser(userId: number, timestamp?: number): Promise<void> {
    try {
      const now = timestamp ?? Math.floor(Date.now() / 1000);
      const key = this.getDailyKey(this.activeUsersKey, now);
      await this.redisClient.pfadd(key, String(userId));
      await this.redisClient.expire(key, 86400 * 30); // 30 days retention
    } catch (error) {
      this.logger.error('Failed to record active user', { error });
    }
  }

  async getActiveUsers(startTimestamp: number, endTimestamp: number): Promise<number> {
    try {
      const startDate = new Date(startTimestamp * 1000);
      const endDate = new Date(endTimestamp * 1000);
      const keys: string[] = [];

      for (let current = new Date(startDate); current <= endDate; current.setUTCDate(current.getUTCDate() + 1)) {
        keys.push(this.getDailyKey(this.activeUsersKey, Math.floor(current.getTime() / 1000)));
      }

      if (keys.length === 0) {
        return 0;
      }
      return await this.redisClient.pfcount(...keys);
    } catch (error) {
      this.logger.error('Failed to get active users count', { error });
      return 0;
    }
  }
}
