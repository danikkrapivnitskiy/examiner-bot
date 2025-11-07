import { inject, injectable } from 'tsyringe';

import { env } from '../../config/env';
import type { IAppLogger } from '../ports/logger.port';

export interface IXaiUsageSummary {
  balance: number; // in USD
}

@injectable()
export class XaiUsageMonitoringService {
  private readonly managementKey?: string;
  private readonly teamId?: string;
  private readonly enabled: boolean;

  constructor(@inject('IAppLogger') private readonly logger: IAppLogger) {
    this.managementKey = env.xaiManagementKey;
    this.teamId = env.xaiTeamId;
    this.enabled = !!(this.managementKey && this.teamId);

    if (!this.enabled) {
      this.logger.info('xAI usage monitoring disabled (XAI_MANAGEMENT_KEY or XAI_TEAM_ID not configured)');
    } else {
      this.logger.info('xAI usage monitoring enabled');
    }
  }

  async getUsageSummary(): Promise<IXaiUsageSummary | null> {
    if (!this.enabled || !this.managementKey || !this.teamId) {
      return null;
    }

    const startTime = Date.now();

    try {
      const url = `https://management-api.x.ai/v1/billing/teams/${this.teamId}/prepaid/balance`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.managementKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`xAI management API failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = (await response.json()) as { total?: { val?: string } };

      // The balance is returned in cents (e.g., {"total":{"val":"-491"}} means $4.91)
      // Usually prepaid balance is negative in their system (meaning credit)
      let balance = 0;
      if (data && data.total && typeof data.total.val === 'string') {
        const val = parseInt(data.total.val, 10);
        // Convert cents to dollars and make it positive
        balance = Math.abs(val) / 100;
      }

      const duration = Date.now() - startTime;

      this.logger.info('xAI usage summary retrieved', {
        balance,
        duration,
      });

      return {
        balance,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to fetch xAI usage summary', {
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      return null;
    }
  }
}
