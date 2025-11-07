export interface IUserLock {
  acquireLock(telegramUserId: number, ttlSeconds?: number): Promise<boolean>;
  releaseLock(telegramUserId: number): Promise<void>;
  checkMessageProcessed(telegramUserId: number, updateId: number, ttlSeconds?: number): Promise<boolean>;
}
