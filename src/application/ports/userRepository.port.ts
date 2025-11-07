export interface PersistedTelegramUser {
  readonly id: bigint;
  readonly username?: string | null;
  readonly firstName?: string | null;
  readonly subscriptionEndDate?: Date | null;
  readonly referralCode: string;
  readonly referredBy: bigint | null;
}

export interface IUserRepository {
  upsertTelegramUser(
    telegramUserId: bigint,
    username?: string,
    firstName?: string,
    referredBy?: bigint
  ): Promise<PersistedTelegramUser>;
  updateProfile(telegramUserId: bigint, username?: string, firstName?: string): Promise<void>;
  getUserByReferralCode(referralCode: string): Promise<PersistedTelegramUser | null>;
  getUserById(userId: bigint): Promise<PersistedTelegramUser | null>;
  addSubscription(userId: bigint, days: number): Promise<void>;
  getNewUsersCount(startDate: Date, endDate: Date): Promise<number>;
  getReferralsCount(startDate: Date, endDate: Date): Promise<number>;
  getPurchasesStats(
    startDate: Date,
    endDate: Date
  ): Promise<{ count: number; amountsByCurrency: Record<string, number> }>;
  recordTransaction(userId: bigint, amount: number, currency: string, reason: string): Promise<void>;
}
