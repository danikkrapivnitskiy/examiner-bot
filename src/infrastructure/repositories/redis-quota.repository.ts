import { inject, injectable } from 'tsyringe';
import Redis from 'ioredis';
import type { IAppLogger } from '../../application/ports/logger.port';
import type { IQuotaRepository } from '../../application/ports/quotaRepository.port';
import { QuotaType, type IQuotaUsage } from '../../domain/quota/quota.types';

@injectable()
export class RedisQuotaRepository implements IQuotaRepository {
  private readonly keyPrefix = 'quota:user';

  constructor(
    @inject('Redis') private readonly redisClient: Redis,
    @inject('IAppLogger') private readonly logger: IAppLogger
  ) {}

  private getDailyKey(userId: bigint): string {
    const today = new Date().toISOString().split('T')[0];
    return `${this.keyPrefix}:${userId.toString()}:${today}`;
  }

  async incrementQuota(userId: bigint, type: QuotaType, amount = 1): Promise<number> {
    const key = this.getDailyKey(userId);

    try {
      const newValue = await this.redisClient.hincrby(key, type, amount);

      // If it's the first time we're setting a value today, set the TTL to 24 hours
      if (newValue === amount) {
        await this.redisClient.expire(key, 24 * 60 * 60);
      }

      return newValue;
    } catch (error) {
      this.logger.error('Failed to increment quota in Redis', {
        userId: userId.toString(),
        type,
        error: error instanceof Error ? error.message : String(error),
      });
      // Fallback: return 0 so we don't block the user if Redis fails temporarily
      return 0;
    }
  }

  async getDailyUsage(userId: bigint): Promise<IQuotaUsage> {
    const key = this.getDailyKey(userId);

    try {
      const data = await this.redisClient.hgetall(key);

      return {
        examsGenerated: parseInt(data[QuotaType.EXAMS_GENERATED] || '0', 10),
        audioSeconds: parseInt(data[QuotaType.AUDIO_SECONDS] || '0', 10),
        tutorMessages: parseInt(data[QuotaType.TUTOR_MESSAGES] || '0', 10),
      };
    } catch (error) {
      this.logger.error('Failed to get quota usage from Redis', {
        userId: userId.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
      return { examsGenerated: 0, audioSeconds: 0, tutorMessages: 0 };
    }
  }
}
