import type { IQuotaUsage, QuotaType } from '../../domain/quota/quota.types';

export interface IQuotaRepository {
  /**
   * Increments the specified quota type for the user today and returns the new total.
   */
  incrementQuota(userId: bigint, type: QuotaType, amount?: number): Promise<number>;

  /**
   * Retrieves the current usage for all quota types for the user today.
   */
  getDailyUsage(userId: bigint): Promise<IQuotaUsage>;
}
