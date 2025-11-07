import { injectable, inject } from 'tsyringe';
import type Redis from 'ioredis';

import type { IUserLock } from '../../application/ports/userLock.port';

function userLockRedisKey(telegramUserId: number): string {
  return `user:${telegramUserId}:action_lock`;
}

function processedUpdateRedisKey(telegramUserId: number, updateId: number): string {
  return `user:${telegramUserId}:processed_update:${updateId}`;
}

@injectable()
export class RedisUserLockAdapter implements IUserLock {
  constructor(@inject('Redis') private readonly redis: Redis) {}

  async acquireLock(telegramUserId: number, ttlSeconds = 60): Promise<boolean> {
    const key = userLockRedisKey(telegramUserId);
    const result = await this.redis.set(key, 'locked', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async releaseLock(telegramUserId: number): Promise<void> {
    await this.redis.del(userLockRedisKey(telegramUserId));
  }

  async checkMessageProcessed(telegramUserId: number, updateId: number, ttlSeconds = 300): Promise<boolean> {
    const key = processedUpdateRedisKey(telegramUserId, updateId);
    const result = await this.redis.set(key, 'processed', 'EX', ttlSeconds, 'NX');
    return result !== 'OK'; // If not OK, it was already processed
  }
}
