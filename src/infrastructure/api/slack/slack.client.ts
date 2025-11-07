import { inject, injectable } from 'tsyringe';
import type { IAppLogger } from '../../../application/ports/logger.port';
import { env } from '../../../config/env';

/**
 * Slack API Client Error
 */
export class SlackClientError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'SlackClientError';
  }
}

/**
 * Slack Block Kit types
 */
interface ISlackTextBlock {
  type: 'mrkdwn' | 'plain_text';
  text: string;
}

interface ISlackSectionBlock {
  type: 'section';
  text?: ISlackTextBlock;
  fields?: ISlackTextBlock[];
}

interface ISlackDividerBlock {
  type: 'divider';
}

interface ISlackHeaderBlock {
  type: 'header';
  text: ISlackTextBlock;
}

interface ISlackContextBlock {
  type: 'context';
  elements: ISlackTextBlock[];
}

type ISlackBlock = ISlackSectionBlock | ISlackDividerBlock | ISlackHeaderBlock | ISlackContextBlock;

interface ISlackMessage {
  text?: string;
  blocks?: ISlackBlock[];
}

/**
 * Circuit breaker state
 */
enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

/**
 * Circuit breaker state for a specific webhook
 */
interface ICircuitBreaker {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureTime: number;
}

/**
 * Slack API Client
 * Provides HTTP client for Slack Webhook API
 * Handles rate limiting, retries, and circuit breaker pattern
 * Supports separate webhook URLs for errors and statistics
 */
@injectable()
export class SlackClient {
  private readonly errorsWebhookUrl?: string;
  private readonly statisticsWebhookUrl?: string;
  private readonly timeout: number = 5000; // 5 seconds
  private readonly maxRetries: number = 2;
  private readonly retryDelays: number[] = [1000, 2000]; // 1s, 2s

  // Separate circuit breakers for errors and statistics channels
  private readonly errorsCircuitBreaker: ICircuitBreaker = {
    state: CircuitBreakerState.CLOSED,
    failureCount: 0,
    lastFailureTime: 0,
  };
  private readonly statisticsCircuitBreaker: ICircuitBreaker = {
    state: CircuitBreakerState.CLOSED,
    failureCount: 0,
    lastFailureTime: 0,
  };

  private readonly circuitBreakerThreshold: number = 5;
  private readonly circuitBreakerResetTimeout: number = 3600000; // 1 hour

  constructor(@inject('IAppLogger') private readonly logger: IAppLogger) {
    this.errorsWebhookUrl = env.slackErrorsWebhookUrl;
    this.statisticsWebhookUrl = env.slackStatisticsWebhookUrl;

    if (!this.errorsWebhookUrl && !this.statisticsWebhookUrl) {
      this.logger.warn('Slack reporting is not fully enabled (missing webhooks)');
    }
  }

  /**
   * Send error message to Slack
   */
  async sendError(error: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
    context?: Record<string, unknown>;
  }): Promise<void> {
    const blocks: ISlackBlock[] = [];

    // Header - compact with severity emoji
    const severity = this.determineErrorSeverity(error);
    const emoji = severity === 'critical' ? '🔴' : '🟠';

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *${error.name}*${error.code ? ` (${error.code})` : ''}`,
      },
    });

    // Message - inline or code block
    let messageText: string;
    if (error.message.length > 100) {
      const truncated = this.truncate(error.message, 500);
      messageText = `\`\`\`${truncated}\`\`\``;
    } else {
      messageText = error.message;
    }

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: messageText,
      },
    });

    // Context - filtered and formatted
    if (error.context && Object.keys(error.context).length > 0) {
      const contextParts = this.formatErrorContext(error.context);

      if (contextParts.length > 0) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: contextParts.join(' • '),
            },
          ],
        });
      }
    }

    // Stack trace - only for critical errors
    if (error.stack && severity === 'critical') {
      const relevantStack = this.extractRelevantStack(error.stack);
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `\`\`\`${relevantStack}\`\`\``,
        },
      });
    }

    if (!this.errorsWebhookUrl) {
      this.logger.warn('SLACK_ERRORS_WEBHOOK_URL not configured, skipping error report');
      return;
    }

    await this.sendMessage(
      {
        text: `${emoji} ${error.name}: ${error.message}`,
        blocks,
      },
      this.errorsWebhookUrl,
      'errors'
    );
  }

  /**
   * Send daily statistics report to Slack
   */
  async sendDailyReport(stats: {
    date: string;
    newUsers: number;
    activeUsers: number;
    referralsCount: number;
    examsCompleted: number;
    questionsAnswered: number;
    paymentsOpened: number;
    purchases: {
      count: number;
      amountsByCurrency: Record<string, number>;
    };
    topUsers: Array<{
      userId: number;
      username?: string;
      examsCount: number;
    }>;
    openai?: {
      totalRequests: number;
      totalTokens: number;
      totalCost: number;
    };
    grok?: {
      balance: number;
    };
    errors: { total: number; critical: number; warnings: number; byType: Array<{ type: string; count: number }> };
  }): Promise<void> {
    const blocks: ISlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📊 ${stats.date}`,
        },
      },
    ];

    // ========== USERS & EXAMS ==========
    let mainText = `*👥 USERS:* ${stats.newUsers} new · ${stats.activeUsers} active · ${stats.referralsCount} referrals`;
    mainText += `\n*🎓 EXAMS:* ${stats.examsCompleted} completed · ${stats.questionsAnswered} questions answered`;

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: mainText,
      },
    });

    // ========== MONETIZATION ==========
    let monetizationText = `*💳 MONETIZATION:* ${stats.paymentsOpened} /payments opened`;
    if (stats.purchases.count > 0) {
      const amountsStr = Object.entries(stats.purchases.amountsByCurrency)
        .map(([currency, amount]) => `${currency.toUpperCase()}: ${amount.toFixed(2)}`)
        .join(', ');
      monetizationText += `\n*Purchases:* ${stats.purchases.count} (${amountsStr})`;
    }

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: monetizationText,
      },
    });

    // ========== TOP 5 USERS (Exams) ==========
    if (stats.topUsers.length > 0) {
      const topUsersText = stats.topUsers
        .slice(0, 5)
        .map((user, index) => {
          const username = user.username ? `@${user.username}` : `User${user.userId}`;
          return `${index + 1}. ${username}: ${user.examsCount} exams`;
        })
        .join('\n');

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🏆 TOP USERS (Exams):*\n${topUsersText}`,
        },
      });
    }

    // ========== OPENAI USAGE ==========
    if (stats.openai) {
      const o = stats.openai;
      const costText = `$${o.totalCost.toFixed(2)}`;
      const tokensK = (o.totalTokens / 1000).toFixed(1);

      let openaiText = `*🤖 OPENAI:* ${o.totalRequests.toLocaleString()} requests`;
      openaiText += `\nTokens: ${tokensK}K · Cost: ${costText}`;

      if (o.totalCost > 20) {
        openaiText = `*🤖 OPENAI:* ⚠️ HIGH COST - ${o.totalRequests.toLocaleString()} requests\nTokens: ${tokensK}K · Cost: ${costText}`;
      }

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: openaiText,
        },
      });
    }

    // ========== XAI USAGE ==========
    if (stats.grok) {
      const x = stats.grok;
      const balanceText = `$${x.balance.toFixed(2)}`;

      let xaiText = `*🤖 xAI (Grok):* Balance: ${balanceText}`;

      if (x.balance < 5) {
        xaiText = `*🤖 xAI (Grok):* 🚨 CRITICAL LOW BALANCE - ${balanceText}`;
      } else if (x.balance < 15) {
        xaiText = `*🤖 xAI (Grok):* ⚠️ LOW BALANCE - ${balanceText}`;
      }

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: xaiText,
        },
      });
    }

    // ========== ERRORS ==========
    if (stats.errors.total > 0) {
      let errorText = `*⚠️ ERRORS:* ${stats.errors.total} total\n`;

      if (stats.errors.critical > 0) {
        const criticalErrors = stats.errors.byType
          .filter((e) => this.determineErrorSeverity({ name: e.type }) === 'critical')
          .slice(0, 3);

        if (criticalErrors.length > 0) {
          errorText += `🔴 *Critical:* ${stats.errors.critical} (${criticalErrors.map((e) => `${e.type}: ${e.count}`).join(', ')})\n`;
        }
      }

      if (stats.errors.warnings > 0) {
        const warningErrors = stats.errors.byType
          .filter((e) => this.determineErrorSeverity({ name: e.type }) === 'warning')
          .slice(0, 3);

        if (warningErrors.length > 0) {
          errorText += `🟡 *Warnings:* ${stats.errors.warnings} (${warningErrors.map((e) => `${e.type}: ${e.count}`).join(', ')})`;
        }
      }

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: errorText.trim(),
        },
      });
    }

    if (!this.statisticsWebhookUrl) {
      this.logger.warn('SLACK_STATISTICS_WEBHOOK_URL not configured, skipping daily report');
      return;
    }

    await this.sendMessage(
      {
        text: `📊 ${stats.date}: ${stats.newUsers} new · ${stats.examsCompleted} exams`,
        blocks,
      },
      this.statisticsWebhookUrl,
      'statistics'
    );
  }

  /**
   * Determine error severity based on type and context
   */
  determineErrorSeverity(error: { name: string; code?: string; message?: string }): 'critical' | 'warning' {
    const name = error.name.toLowerCase();
    const code = error.code?.toLowerCase() || '';
    const message = error.message?.toLowerCase() || '';

    if (
      code.includes('500') ||
      code.includes('503') ||
      code.includes('504') ||
      name.includes('critical') ||
      name.includes('fatal') ||
      name.includes('crash') ||
      name.includes('oom') ||
      message.includes('redis disconnect') ||
      message.includes('database') ||
      message.includes('cannot connect')
    ) {
      return 'critical';
    }

    return 'warning';
  }

  /**
   * Send generic message to Slack
   */
  async sendMessage(message: ISlackMessage, webhookUrl: string, channelType: 'errors' | 'statistics'): Promise<void> {
    const circuitBreaker = channelType === 'errors' ? this.errorsCircuitBreaker : this.statisticsCircuitBreaker;

    if (circuitBreaker.state === CircuitBreakerState.OPEN) {
      const timeSinceLastFailure = Date.now() - circuitBreaker.lastFailureTime;
      if (timeSinceLastFailure > this.circuitBreakerResetTimeout) {
        circuitBreaker.state = CircuitBreakerState.HALF_OPEN;
        circuitBreaker.failureCount = 0;
        this.logger.info(`Slack ${channelType} circuit breaker: Attempting recovery`);
      } else {
        this.logger.warn(`Slack ${channelType} circuit breaker is OPEN, skipping message`);
        return;
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await this.sendRequest(message, webhookUrl);
        if (circuitBreaker.state === CircuitBreakerState.HALF_OPEN) {
          circuitBreaker.state = CircuitBreakerState.CLOSED;
        }
        circuitBreaker.failureCount = 0;
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        circuitBreaker.failureCount++;

        if (circuitBreaker.failureCount >= this.circuitBreakerThreshold) {
          circuitBreaker.state = CircuitBreakerState.OPEN;
          circuitBreaker.lastFailureTime = Date.now();
          this.logger.error(`Slack ${channelType} circuit breaker opened`, {
            failureCount: circuitBreaker.failureCount,
            threshold: this.circuitBreakerThreshold,
          });
        }

        if (attempt < this.maxRetries) {
          const delay = this.retryDelays[attempt] ?? this.retryDelays.at(-1) ?? 1000;
          await this.sleep(delay);
        }
      }
    }

    this.logger.error(`Failed to send Slack ${channelType} message after retries`, {
      error: lastError?.message,
      attempts: this.maxRetries + 1,
    });
  }

  private async sendRequest(message: ISlackMessage, webhookUrl: string): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        const errorMessage =
          errorText === 'Unknown error'
            ? `Slack API error: ${response.status} ${response.statusText}`
            : `Slack API error: ${response.status} ${response.statusText} - ${errorText}`;
        throw new SlackClientError(errorMessage, 'SLACK_API_ERROR', response.status);
      }

      this.logger.debug('Slack message sent successfully');
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new SlackClientError('Slack request timeout', 'TIMEOUT');
      }

      if (error instanceof SlackClientError) {
        throw error;
      }

      throw new SlackClientError(
        `Failed to send Slack message: ${error instanceof Error ? error.message : String(error)}`,
        'NETWORK_ERROR'
      );
    }
  }

  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) {
      return str;
    }
    return `${str.substring(0, maxLength - 3)}...`;
  }

  private formatErrorContext(context: Record<string, unknown>): string[] {
    const parts: string[] = [];
    const priorityFields = ['chatId', 'userId', 'username', 'operation', 'errorType'];
    const secondaryFields = ['sessionId', 'correlationId', 'duration', 'retries', 'statusCode'];
    const skipFields = new Set(['errorCount', 'hasMultipleErrors', 'timestamp']);

    const shortenValue = (key: string, value: unknown): string => {
      const str = String(value);
      if (str === 'N/A' || str === 'null' || str === 'undefined' || str === '') {
        return '';
      }
      if ((key.includes('Id') || key.includes('session') || key.includes('correlation')) && str.length > 20) {
        return `${str.slice(0, 8)}...${str.slice(-4)}`;
      }
      if (str.length > 50) {
        return `${str.slice(0, 47)}...`;
      }
      return str;
    };

    for (const field of priorityFields) {
      if (field in context && !skipFields.has(field)) {
        const value = shortenValue(field, context[field]);
        if (value) {
          parts.push(`${field}: ${value}`);
        }
      }
    }

    for (const field of secondaryFields) {
      if (field in context && !skipFields.has(field)) {
        const value = shortenValue(field, context[field]);
        if (value) {
          parts.push(`${field}: ${value}`);
        }
      }
    }

    for (const [key, val] of Object.entries(context)) {
      if (parts.length >= 8) {
        break;
      }
      if (!priorityFields.includes(key) && !secondaryFields.includes(key) && !skipFields.has(key)) {
        const value = shortenValue(key, val);
        if (value) {
          parts.push(`${key}: ${value}`);
        }
      }
    }

    return parts;
  }

  private extractRelevantStack(stack: string): string {
    const lines = stack.split('\n');
    const relevant = lines.slice(0, 6).join('\n');
    return this.truncate(relevant, 800);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
