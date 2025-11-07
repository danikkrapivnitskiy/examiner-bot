import { inject, injectable } from 'tsyringe';
import type { IAppLogger } from '../ports/logger.port';
import type { IStatisticsRepository } from '../../domain/repositories/statistics.repository';
import type { IUserRepository } from '../ports/userRepository.port';
import { env } from '../../config/env';
import { OpenAIUsageMonitoringService } from './openai-usage-monitoring.service';

import { XaiUsageMonitoringService } from './xai-usage-monitoring.service';

import type { IStatisticsService, IDailyStatistics } from '../ports/statisticsService.port';

@injectable()
export class StatisticsService implements IStatisticsService {
  constructor(
    @inject('IStatisticsRepository') private readonly statisticsRepo: IStatisticsRepository,
    @inject('IUserRepository') private readonly userRepository: IUserRepository,
    @inject('OpenAIUsageMonitoringService') private readonly openaiUsageService: OpenAIUsageMonitoringService,
    @inject('XaiUsageMonitoringService') private readonly xaiUsageService: XaiUsageMonitoringService,
    @inject('IAppLogger') private readonly logger: IAppLogger,
    @inject('ADMIN_IDS') private readonly adminIds: readonly bigint[]
  ) {}

  async trackPaymentOpened(userId: number): Promise<void> {
    if (this.adminIds.includes(BigInt(userId))) {
      return;
    }
    await this.statisticsRepo.incrementPaymentsOpened();
  }

  async trackExamCompleted(userId: number): Promise<void> {
    if (this.adminIds.includes(BigInt(userId))) {
      return;
    }
    await this.statisticsRepo.incrementExamsCompleted();
  }

  async trackQuestionAnswered(userId: number): Promise<void> {
    if (this.adminIds.includes(BigInt(userId))) {
      return;
    }
    await this.statisticsRepo.incrementQuestionsAnswered();
  }

  async trackPurchase(userId: number, amount: number, currency: string, reason: string): Promise<void> {
    if (this.adminIds.includes(BigInt(userId))) {
      return;
    }
    await this.userRepository.recordTransaction(BigInt(userId), amount, currency, reason);
  }

  async trackTopUser(userId: number, scoreIncrement: number): Promise<void> {
    if (this.adminIds.includes(BigInt(userId))) {
      return;
    }
    await this.statisticsRepo.updateTopUsers(userId, scoreIncrement);
  }

  async trackActiveUser(userId: number): Promise<void> {
    if (this.adminIds.includes(BigInt(userId))) {
      return;
    }
    await this.statisticsRepo.recordActiveUser(userId);
  }

  async getDailyStatistics(date: Date = new Date()): Promise<IDailyStatistics> {
    const dateString = date.toISOString().split('T')[0];

    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const startTimestamp = Math.floor(startOfDay.getTime() / 1000);
    const endTimestamp = Math.ceil(endOfDay.getTime() / 1000) - 1;

    try {
      // Collect metrics
      const [
        paymentsOpened,
        examsCompleted,
        questionsAnswered,
        errorCounts,
        topUsersRaw,
        openaiUsage,
        xaiUsage,
        newUsers,
        referralsCount,
        purchases,
        activeUsers,
      ] = await Promise.all([
        this.statisticsRepo.getPaymentsOpened(startTimestamp, endTimestamp),
        this.statisticsRepo.getExamsCompleted(startTimestamp, endTimestamp),
        this.statisticsRepo.getQuestionsAnswered(startTimestamp, endTimestamp),
        this.statisticsRepo.getErrorCounts(startTimestamp, endTimestamp),
        this.statisticsRepo.getTopUsers(startTimestamp, endTimestamp, 5),
        env.LLM_PROVIDER === 'openai'
          ? this.openaiUsageService.getUsageSummary(startTimestamp, endTimestamp)
          : Promise.resolve(null),
        env.LLM_PROVIDER === 'grok' ? this.xaiUsageService.getUsageSummary() : Promise.resolve(null),
        this.userRepository.getNewUsersCount(startOfDay, endOfDay),
        this.userRepository.getReferralsCount(startOfDay, endOfDay),
        this.userRepository.getPurchasesStats(startOfDay, endOfDay),
        this.statisticsRepo.getActiveUsers(startTimestamp, endTimestamp),
      ]);

      const topUsers = await Promise.all(
        topUsersRaw.map(async (rawUser) => {
          const user = await this.userRepository.getUserById(BigInt(rawUser.userId));
          return {
            userId: rawUser.userId,
            username: user?.username || undefined,
            examsCount: rawUser.score,
          };
        })
      );

      return {
        date: dateString,
        newUsers,
        activeUsers,
        referralsCount,
        examsCompleted,
        questionsAnswered,
        paymentsOpened,
        purchases,
        topUsers,
        openai: openaiUsage
          ? {
              totalRequests: openaiUsage.totalRequests,
              totalTokens: openaiUsage.totalTokens,
              totalCost: openaiUsage.totalCost,
            }
          : undefined,
        grok: xaiUsage
          ? {
              balance: xaiUsage.balance,
            }
          : undefined,
        errors: {
          total: errorCounts.total,
          critical: errorCounts.critical,
          warnings: errorCounts.warnings,
          byType: errorCounts.byType,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get daily statistics', { error });
      throw error;
    }
  }
}
