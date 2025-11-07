import { inject, injectable } from 'tsyringe';
import type { IAppLogger } from '../ports/logger.port';
import type { IStatisticsRepository } from '../../domain/repositories/statistics.repository';
import { SlackClient } from '../../infrastructure/api/slack/slack.client';

interface IErrorEntry {
  name: string;
  message: string;
  code?: string;
  stack?: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

@injectable()
export class ErrorReportingService {
  private readonly errorQueue: IErrorEntry[] = [];
  private readonly rateLimitMap: Map<string, number> = new Map();
  private readonly maxQueueSize: number = 100;
  private readonly rateLimitSeconds: number = 300; // 5 minutes
  private isProcessing: boolean = false;
  private backgroundWorkerInterval: NodeJS.Timeout | null = null;

  constructor(
    @inject('SlackClient') private readonly slackClient: SlackClient,
    @inject('IStatisticsRepository') private readonly statisticsRepo: IStatisticsRepository,
    @inject('IAppLogger') private readonly logger: IAppLogger
  ) {
    this.startBackgroundWorker();
  }

  shutdown(): void {
    if (this.backgroundWorkerInterval) {
      clearInterval(this.backgroundWorkerInterval);
      this.backgroundWorkerInterval = null;
    }
  }

  report(error: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
    context?: Record<string, unknown>;
  }): void {
    setImmediate(() => {
      this.addToQueue(error);
    });
  }

  private addToQueue(error: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
    context?: Record<string, unknown>;
  }): void {
    const errorKey = this.getErrorKey(error);
    const lastSent = this.rateLimitMap.get(errorKey);
    const now = Date.now();

    if (lastSent && now - lastSent < this.rateLimitSeconds * 1000) {
      this.logger.debug('Error rate limited', { errorKey, lastSent, now });
      return;
    }

    if (this.errorQueue.length >= this.maxQueueSize) {
      const removed = this.errorQueue.shift();
      this.logger.warn('Error queue full, dropping oldest error', {
        droppedError: removed?.name,
        queueSize: this.errorQueue.length,
      });
    }

    this.errorQueue.push({
      ...error,
      timestamp: now,
    });

    this.rateLimitMap.set(errorKey, now);

    this.trackErrorInStatistics(error).catch((err) => {
      this.logger.error('Failed to track error in statistics', { error: err });
    });
  }

  private getErrorKey(error: { name: string; message: string; code?: string }): string {
    const messagePattern = error.message.substring(0, 50).replace(/\d+/g, '*');
    return `${error.name}:${messagePattern}`;
  }

  private startBackgroundWorker(): void {
    this.backgroundWorkerInterval = setInterval(() => {
      if (!this.isProcessing && this.errorQueue.length > 0) {
        this.processQueue().catch((error) => {
          this.logger.error('Error processing error queue', { error });
        });
      }
    }, 1000);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.errorQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const batchSize = 10;
      const batch = this.errorQueue.splice(0, batchSize);

      const promises = batch.map((error) =>
        this.slackClient.sendError(error).catch((err) => {
          this.logger.error('Failed to send error to Slack', { error: err, errorName: error.name });
        })
      );

      await Promise.allSettled(promises);
    } finally {
      this.isProcessing = false;
    }
  }

  private async trackErrorInStatistics(error: {
    name: string;
    code?: string;
    message?: string;
    context?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const severity = this.slackClient.determineErrorSeverity(error);
      const isCritical = severity === 'critical';

      await this.statisticsRepo.incrementErrorCount(error.name, isCritical);
      await this.statisticsRepo.addErrorSample(this.buildErrorSample(error));
    } catch (err) {
      this.logger.debug('Failed to track error in statistics', { error: err });
    }
  }

  private buildErrorSample(error: {
    name: string;
    code?: string;
    message?: string;
    context?: Record<string, unknown>;
  }): { name: string; message: string; code?: string; timestamp: number; context?: Record<string, unknown> } {
    const maxMessageLength = 200;
    const message = (error.message ?? 'Unknown error').slice(0, maxMessageLength);

    return {
      name: error.name,
      message,
      code: error.code,
      timestamp: Date.now(),
      context: error.context,
    };
  }

  cleanup(): void {
    const now = Date.now();
    const maxAge = this.rateLimitSeconds * 1000 * 2;

    for (const [key, timestamp] of this.rateLimitMap.entries()) {
      if (now - timestamp > maxAge) {
        this.rateLimitMap.delete(key);
      }
    }
  }
}
