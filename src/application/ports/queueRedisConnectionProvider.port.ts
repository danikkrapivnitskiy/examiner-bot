import type IORedis from 'ioredis';

export interface IQueueRedisConnectionProvider {
  getConnection(): Promise<IORedis>;
  releaseConnection(): Promise<void>;
  getRefCount(): number;
  hasConnection(): boolean;
}
