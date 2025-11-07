import { config as loadEnv } from 'dotenv';
import type { z } from 'zod';
import { envSchema, webhookUrlRequiredMessage } from './schemas/env.schema';

loadEnv();

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const webhookIssue = parsed.error.errors.find(
      (issue) => issue.code === 'custom' && issue.message === webhookUrlRequiredMessage
    );
    if (webhookIssue) {
      throw new Error(webhookUrlRequiredMessage);
    }
    const message = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment: ${JSON.stringify(message)}`);
  }
  return parsed.data;
}

export const env = parseEnv();
