import * as cron from 'node-cron';
import { inject, injectable } from 'tsyringe';

import type { IStatisticsService } from '../../application/ports/statisticsService.port';
import { env } from '../../config/env';
import { SlackClient } from '../api/slack/slack.client';
import type { IAppLogger } from '../../application/ports/logger.port';
import { ReportRetryQueue } from './report-retry-queue';

@injectable()
export class DailyReportScheduler {
  private cronTask: cron.ScheduledTask | null = null;
  private readonly retryQueue: ReportRetryQueue;

  constructor(
    @inject('IStatisticsService') private readonly statisticsService: IStatisticsService,
    @inject('SlackClient') private readonly slackClient: SlackClient,
    @inject('IAppLogger') private readonly logger: IAppLogger
  ) {
    this.retryQueue = new ReportRetryQueue();
  }

  start(): void {
    if (!env.slackStatisticsWebhookUrl) {
      this.logger.info('Slack statistics reporting disabled, skipping daily report scheduler');
      return;
    }

    const cronExpression = '0 1 * * *'; // 01:00 UTC
    this.logger.info('Starting daily report scheduler', { cronExpression });

    this.cronTask = cron.schedule(
      cronExpression,
      async () => {
        try {
          this.logger.info('Running scheduled daily report');
          await this.generateAndSendReport();
        } catch (error) {
          this.logger.error('Failed to generate daily report', { error });
        }
      },
      { timezone: 'UTC' }
    );
  }

  stop(): void {
    if (this.cronTask) {
      void this.cronTask.stop();
      this.cronTask = null;
    }
    this.retryQueue.destroy();
  }

  async generateAndSendReport(): Promise<void> {
    try {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      yesterday.setUTCHours(0, 0, 0, 0);

      const stats = await this.statisticsService.getDailyStatistics(yesterday);

      try {
        await this.slackClient.sendDailyReport(stats);
        this.logger.info('Daily report sent successfully', { date: stats.date });
        this.retryQueue.removeFromQueue(yesterday);
      } catch (sendError) {
        const errorMessage = sendError instanceof Error ? sendError.message : String(sendError);
        this.logger.error('Failed to send daily report, adding to retry queue', { error: errorMessage });
        this.retryQueue.addToQueue(yesterday, stats, errorMessage);
        throw sendError;
      }
    } catch (error) {
      this.logger.error('Failed to generate or send daily report', { error });
      throw error;
    }
  }
}
