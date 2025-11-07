import type { IDailyStatistics } from '../../application/ports/statisticsService.port';
// Use console for retry queue since it's not injected
/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
const logger = {
  info: (msg: string, data?: any) => console.log(msg, data),
  warn: (msg: string, data?: any) => console.warn(msg, data),
  error: (msg: string, data?: any) => console.error(msg, data),
  debug: (msg: string, data?: any) => console.debug(msg, data),
};
/* eslint-enable no-console, @typescript-eslint/no-explicit-any */

/**
 * Report Retry Queue
 * Enterprise-grade failure recovery for daily reports
 * Retries failed reports with exponential backoff
 */

interface IRetryQueueItem {
  date: Date;
  stats: IDailyStatistics;
  attemptCount: number;
  lastAttemptTime: number;
  error?: string;
}

export class ReportRetryQueue {
  private queue: Map<string, IRetryQueueItem> = new Map();
  private readonly maxRetries = 3;
  private readonly baseDelayMs = 60000; // 1 minute
  private readonly maxDelayMs = 1800000; // 30 minutes
  private retryTimer: NodeJS.Timeout | null = null;

  /**
   * Add failed report to retry queue
   */
  addToQueue(date: Date, stats: IDailyStatistics, error: string): void {
    const key = this.getQueueKey(date);
    const existing = this.queue.get(key);

    if (existing) {
      // Increment retry count
      existing.attemptCount++;
      existing.error = error;
      existing.lastAttemptTime = Date.now();
    } else {
      // Add new item
      this.queue.set(key, {
        date,
        stats,
        attemptCount: 1,
        lastAttemptTime: Date.now(),
        error,
      });
    }

    logger.info('Report added to retry queue', {
      date: this.formatDate(date),
      attemptCount: existing ? existing.attemptCount : 1,
      queueSize: this.queue.size,
      error,
    });

    // Start retry timer if not already running
    if (!this.retryTimer) {
      this.startRetryTimer();
    }
  }

  /**
   * Remove successfully sent report from queue
   */
  removeFromQueue(date: Date): void {
    const key = this.getQueueKey(date);
    const removed = this.queue.delete(key);

    if (removed) {
      logger.info('Report removed from retry queue (success)', {
        date: this.formatDate(date),
        remainingInQueue: this.queue.size,
      });
    }

    // Stop retry timer if queue is empty
    if (this.queue.size === 0 && this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Get reports ready for retry
   */
  getRetryableReports(): Array<{ date: Date; stats: IDailyStatistics }> {
    const now = Date.now();
    const retryable: Array<{ date: Date; stats: IDailyStatistics }> = [];

    for (const [key, item] of this.queue.entries()) {
      // Skip if max retries exceeded
      if (item.attemptCount >= this.maxRetries) {
        logger.error('Report max retries exceeded, removing from queue', {
          date: this.formatDate(item.date),
          attemptCount: item.attemptCount,
          lastError: item.error,
        });
        this.queue.delete(key);
        continue;
      }

      // Calculate next retry time with exponential backoff
      const nextRetryDelay = Math.min(this.baseDelayMs * Math.pow(2, item.attemptCount - 1), this.maxDelayMs);
      const nextRetryTime = item.lastAttemptTime + nextRetryDelay;

      // Check if ready for retry
      if (now >= nextRetryTime) {
        retryable.push({ date: item.date, stats: item.stats });
      }
    }

    return retryable;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    size: number;
    items: Array<{ date: string; attemptCount: number; error?: string }>;
  } {
    return {
      size: this.queue.size,
      items: Array.from(this.queue.values()).map((item) => ({
        date: this.formatDate(item.date),
        attemptCount: item.attemptCount,
        error: item.error,
      })),
    };
  }

  /**
   * Clear all items from queue
   */
  clearQueue(): void {
    const size = this.queue.size;
    this.queue.clear();

    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }

    logger.info('Retry queue cleared', { itemsRemoved: size });
  }

  /**
   * Start retry timer
   */
  private startRetryTimer(): void {
    // Check every minute for retryable reports
    this.retryTimer = setInterval(
      () => {
        const retryable = this.getRetryableReports();
        if (retryable.length > 0) {
          logger.info('Reports ready for retry', {
            count: retryable.length,
            dates: retryable.map((r) => this.formatDate(r.date)),
          });
        }
      },
      60000 // 1 minute
    );
  }

  /**
   * Get queue key for date
   */
  private getQueueKey(date: Date): string {
    return date.toISOString().split('T')[0] || '';
  }

  /**
   * Format date for logging
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0] || '';
  }

  /**
   * Cleanup timer on shutdown
   * Prevents memory leaks when service is stopped
   */
  destroy(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
