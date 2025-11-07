/**
 * OpenAI Usage Monitoring Service
 * Monitors OpenAI API usage and costs using Admin API key
 *
 * Requires OPENAI_ADMIN_API_KEY environment variable
 * Admin keys can be created at: https://platform.openai.com/settings/organization/admin-keys
 */

import { inject, injectable } from 'tsyringe';

import { env } from '../../config/env';
import type { IAppLogger } from '../ports/logger.port';

/**
 * OpenAI Usage API Response for Completions
 * https://developers.openai.com/api/reference/resources/organization/subresources/audit_logs/subresources/usage/
 */
/* eslint-disable @typescript-eslint/naming-convention */
interface IOpenAIUsageResponse {
  object: 'page';
  data: Array<{
    object: 'bucket';
    start_time: number;
    end_time: number;
    results: Array<{
      object: 'organization.usage.completions.result';
      num_model_requests: number;
      input_tokens: number;
      output_tokens: number;
      input_cached_tokens: number;
      input_text_tokens: number;
      output_text_tokens: number;
      input_audio_tokens: number;
      output_audio_tokens: number;
    }>;
  }>;
  has_more: boolean;
  next_page?: string | null;
}
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * OpenAI Costs API Response
 * https://developers.openai.com/api/reference/resources/organization/subresources/audit_logs/methods/get_costs
 */
/* eslint-disable @typescript-eslint/naming-convention */
interface IOpenAICostsResponse {
  object: 'page';
  data: Array<{
    object: 'bucket';
    start_time: number;
    end_time: number;
    results: Array<{
      object: 'organization.costs.result';
      amount: {
        value: string; // Decimal string
        currency: 'usd';
      };
      line_item: string | null;
      user_id: string | null;
      project_id: string | null;
    }>;
  }>;
  has_more: boolean;
  next_page?: string | null;
}
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * OpenAI usage summary
 */
export interface IOpenAIUsageSummary {
  totalRequests: number;
  totalTokens: number;
  totalCost: number; // in USD
  period: {
    start: number; // Unix timestamp
    end: number; // Unix timestamp
  };
}

@injectable()
export class OpenAIUsageMonitoringService {
  private readonly adminApiKey?: string;
  private readonly enabled: boolean;

  constructor(@inject('IAppLogger') private readonly logger: IAppLogger) {
    this.adminApiKey = env.openaiAdminApiKey;
    this.enabled = !!this.adminApiKey;

    if (!this.enabled) {
      this.logger.info('OpenAI usage monitoring disabled (OPENAI_ADMIN_API_KEY not configured)');
    } else {
      this.logger.info('OpenAI usage monitoring enabled');
    }
  }

  /**
   * Get usage summary for a specific time period
   * @param startTimestamp - Start time in Unix seconds
   * @param endTimestamp - End time in Unix seconds
   * @returns Usage summary or null if monitoring is disabled
   */
  async getUsageSummary(startTimestamp: number, endTimestamp: number): Promise<IOpenAIUsageSummary | null> {
    if (!this.enabled || !this.adminApiKey) {
      this.logger.debug('OpenAI usage monitoring is disabled');
      return null;
    }

    const startTime = Date.now();

    try {
      this.logger.debug('Fetching OpenAI usage summary', {
        startTimestamp,
        endTimestamp,
        startDate: new Date(startTimestamp * 1000).toISOString(),
        endDate: new Date(endTimestamp * 1000).toISOString(),
      });

      // Fetch usage data (parallel requests)
      const [usageResponse, costsResponse] = await Promise.all([
        this.fetchUsageData(startTimestamp, endTimestamp),
        this.fetchCostsData(startTimestamp, endTimestamp),
      ]);

      // Aggregate usage (new format with buckets)
      let totalRequests = 0;
      let totalTokens = 0;

      for (const bucket of usageResponse.data) {
        for (const result of bucket.results) {
          totalRequests += result.num_model_requests;
          totalTokens += result.input_tokens + result.output_tokens;
        }
      }

      // Aggregate costs (new format with buckets)
      let totalCost = 0;
      for (const bucket of costsResponse.data) {
        for (const result of bucket.results) {
          totalCost += parseFloat(result.amount.value);
        }
      }

      const duration = Date.now() - startTime;

      this.logger.info('OpenAI usage summary retrieved', {
        totalRequests,
        totalTokens,
        totalCost: totalCost.toFixed(2),
        period: { start: startTimestamp, end: endTimestamp },
        duration,
      });

      return {
        totalRequests,
        totalTokens,
        totalCost,
        period: {
          start: startTimestamp,
          end: endTimestamp,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to fetch OpenAI usage summary', {
        error: error instanceof Error ? error.message : String(error),
        startTimestamp,
        endTimestamp,
        duration,
      });

      return null;
    }
  }

  /**
   * Fetch usage data from OpenAI API
   */
  private async fetchUsageData(startTime: number, endTime: number): Promise<IOpenAIUsageResponse> {
    const url = new URL('https://api.openai.com/v1/organization/usage/completions');
    url.searchParams.set('start_time', startTime.toString());
    url.searchParams.set('end_time', endTime.toString());
    url.searchParams.set('bucket_width', '1d'); // Daily buckets

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.adminApiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI usage API failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      return (await response.json()) as IOpenAIUsageResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetch costs data from OpenAI API
   */
  private async fetchCostsData(startTime: number, endTime: number): Promise<IOpenAICostsResponse> {
    // OpenAI Costs API requires end_time to be AFTER start_time (exclusive)
    // Add 1 second to ensure valid range
    const adjustedEndTime = endTime + 1;

    const url = new URL('https://api.openai.com/v1/organization/costs');
    url.searchParams.set('start_time', startTime.toString());
    url.searchParams.set('end_time', adjustedEndTime.toString());
    url.searchParams.set('bucket_width', '1d'); // Daily buckets

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.adminApiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI costs API failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      return (await response.json()) as IOpenAICostsResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
