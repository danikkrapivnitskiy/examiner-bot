import { injectable, inject } from 'tsyringe';
import type { PrismaClient } from '@prisma/client';

import type { IUserRepository, PersistedTelegramUser } from '../../application/ports/userRepository.port';
import { TransactionReason, Currency } from '../../domain/enums/transaction.enum';

import { env } from '../../config/env';

@injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(@inject('PrismaClient') private readonly db: PrismaClient) {}

  async upsertTelegramUser(
    telegramUserId: bigint,
    username?: string,
    firstName?: string,
    referredBy?: bigint
  ): Promise<PersistedTelegramUser> {
    // Calculate trial period based on env config
    const trialDays = referredBy ? env.TRIAL_DAYS_REFERRED : env.TRIAL_DAYS_DEFAULT;
    const trialEndDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

    const dbUser = await this.db.user.upsert({
      where: { id: telegramUserId },
      update: {
        username,
        firstName,
      },
      create: {
        id: telegramUserId,
        username,
        firstName,
        subscriptionEndDate: trialEndDate,
        ...(referredBy !== undefined ? { referredBy } : {}),
      },
    });

    return {
      id: dbUser.id,
      username: dbUser.username,
      firstName: dbUser.firstName,
      subscriptionEndDate: dbUser.subscriptionEndDate,
      referralCode: dbUser.referralCode,
      referredBy: dbUser.referredBy,
    };
  }

  async updateProfile(telegramUserId: bigint, username?: string, firstName?: string): Promise<void> {
    await this.db.user.update({
      where: { id: telegramUserId },
      data: {
        username,
        firstName,
      },
    });
  }

  async getUserByReferralCode(referralCode: string): Promise<PersistedTelegramUser | null> {
    const dbUser = await this.db.user.findUnique({
      where: { referralCode },
    });

    if (!dbUser) {
      return null;
    }

    return {
      id: dbUser.id,
      username: dbUser.username,
      firstName: dbUser.firstName,
      subscriptionEndDate: dbUser.subscriptionEndDate,
      referralCode: dbUser.referralCode,
      referredBy: dbUser.referredBy,
    };
  }

  async getUserById(userId: bigint): Promise<PersistedTelegramUser | null> {
    const dbUser = await this.db.user.findUnique({
      where: { id: userId },
    });

    if (!dbUser) {
      return null;
    }

    return {
      id: dbUser.id,
      username: dbUser.username,
      firstName: dbUser.firstName,
      subscriptionEndDate: dbUser.subscriptionEndDate,
      referralCode: dbUser.referralCode,
      referredBy: dbUser.referredBy,
    };
  }

  async addSubscription(userId: bigint, days: number): Promise<void> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return;
    }

    const now = new Date();
    const currentEnd = user.subscriptionEndDate;
    const startDate = currentEnd && currentEnd > now ? currentEnd : now;

    const newEndDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);

    await this.db.user.update({
      where: { id: userId },
      data: { subscriptionEndDate: newEndDate },
    });
  }

  async getNewUsersCount(startDate: Date, endDate: Date): Promise<number> {
    return this.db.user.count({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
  }

  async getReferralsCount(startDate: Date, endDate: Date): Promise<number> {
    return this.db.user.count({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        referredBy: {
          not: null,
        },
      },
    });
  }

  async getPurchasesStats(
    startDate: Date,
    endDate: Date
  ): Promise<{ count: number; amountsByCurrency: Record<string, number> }> {
    const transactions = await this.db.transaction.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        amount: {
          gt: 0,
        },
        reason: TransactionReason.PAYMENT,
      },
    });

    const amountsByCurrency: Record<string, number> = {};

    for (const tx of transactions) {
      const currency = tx.currency || Currency.CZK;
      amountsByCurrency[currency] = (amountsByCurrency[currency] || 0) + tx.amount;
    }

    return {
      count: transactions.length,
      amountsByCurrency,
    };
  }

  async recordTransaction(
    userId: bigint,
    amount: number,
    currency: Currency,
    reason: TransactionReason
  ): Promise<void> {
    await this.db.transaction.create({
      data: {
        userId,
        amount,
        currency,
        reason,
      },
    });
  }
}
