import { z } from 'zod';
import { AppEdition } from '../app-edition.enum';

function optionalTrimmedUrl() {
  return z.preprocess((value: unknown) => {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }, z.string().url().optional());
}

function optionalTrimmedSecret() {
  return z.preprocess((value: unknown) => {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }, z.string().min(1).max(256).optional());
}

function numberFromEnv(defaultValue: number, max?: number) {
  return z.preprocess((value: unknown) => {
    if (value === undefined || value === '') {
      return defaultValue;
    }
    const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
    if (!Number.isFinite(parsed) || parsed < 1 || (max !== undefined && parsed > max)) {
      return defaultValue;
    }
    return parsed;
  }, z.number().int().positive());
}

function portWithDefault(defaultPort: number) {
  return numberFromEnv(defaultPort, 65535);
}

/** Parses typical env truthy/falsy strings; avoids `Boolean('false') === true`. */
function booleanFromEnv(defaultValue = false) {
  return z.preprocess((value: unknown) => {
    if (value === undefined || value === '') {
      return defaultValue;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalizedBoolString = value.trim().toLowerCase();
      if (['true', '1', 'yes'].includes(normalizedBoolString)) {
        return true;
      }
      if (['false', '0', 'no'].includes(normalizedBoolString)) {
        return false;
      }
    }
    return defaultValue;
  }, z.boolean());
}

export const webhookUrlRequiredMessage =
  'Webhook URL is required. Please set WEBHOOK_URL (or TEST_WEBHOOK_URL when USE_TEST_ENVIRONMENT=true) in .env';

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('debug'),

  /**
   * When true, the app uses TELEGRAM_TEST_BOT_TOKEN, TEST_PORT, and TEST_WEBHOOK_URL
   * (aligned with tg-ai-friend-bot). Does not replace NODE_ENV for logging / Prisma.
   */
  USE_TEST_ENVIRONMENT: booleanFromEnv(false),

  PORT: portWithDefault(3000),
  TEST_PORT: portWithDefault(3001),

  /**
   * Full webhook URL Telegram POSTs to (e.g. https://host/webhook).
   * Required when USE_TEST_ENVIRONMENT is false.
   */
  WEBHOOK_URL: optionalTrimmedUrl(),
  /** Required when USE_TEST_ENVIRONMENT is true (e.g. CI / isolated webhook target). */
  TEST_WEBHOOK_URL: optionalTrimmedUrl(),

  /** Passed to Telegram as secret_token and validated by Grammy on incoming webhook requests. */
  TELEGRAM_WEBHOOK_SECRET: optionalTrimmedSecret(),

  /** Required when USE_TEST_ENVIRONMENT is false. */
  TELEGRAM_BOT_TOKEN: z.preprocess((value: unknown) => {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }, z.string().min(1).max(256).optional()),
  /** Required when USE_TEST_ENVIRONMENT is true. */
  TELEGRAM_TEST_BOT_TOKEN: optionalTrimmedSecret(),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  /* eslint-disable @typescript-eslint/naming-convention */
  QUEUE_CONCURRENCY: numberFromEnv(5),
  QUEUE_MAX_SIZE: numberFromEnv(1000),

  /** Maximum questions generated to build the bank. */
  GENERATED_QUESTIONS_PER_EXAM: numberFromEnv(25),

  /** Maximum questions sampled into one exam session (upper bound among generated bank). */
  MAX_QUESTIONS_PER_EXAM_SESSION: numberFromEnv(20),

  /** Daily quota: Maximum exams generated per user per day. */
  QUOTA_DAILY_EXAMS_GENERATED: numberFromEnv(5),

  /** Daily quota: Maximum audio seconds processed per user per day (30 mins = 1800s). */
  QUOTA_DAILY_AUDIO_SECONDS: numberFromEnv(1800),

  /** Daily quota: Maximum tutor messages per user per day. */
  QUOTA_DAILY_TUTOR_MESSAGES: numberFromEnv(150),

  /** Maximum number of exams to keep in the database per user to prevent unbounded growth. */
  MAX_EXAMS_PER_USER: numberFromEnv(20),

  /** Number of recent exams to show in the statistics command. */
  RECENT_EXAMS_DISPLAY_LIMIT: numberFromEnv(5),

  /** Maximum estimated tokens allowed for a single document */
  MAX_DOCUMENT_ESTIMATED_TOKENS: numberFromEnv(50000),

  /** Maximum audio duration in seconds for voice messages. */
  MAX_AUDIO_DURATION_SECONDS: numberFromEnv(30),

  /** Maximum text length in characters for user text messages. */
  MAX_USER_TEXT_LENGTH: numberFromEnv(1000),

  /** Maximum number of messages to keep in the sliding window history for a single question. */
  MAX_HISTORY_MESSAGES: numberFromEnv(10),

  /** Default trial days for new users. */
  TRIAL_DAYS_DEFAULT: numberFromEnv(1),

  /** Trial days for new users who joined via referral link. */
  TRIAL_DAYS_REFERRED: numberFromEnv(2),

  /** Bonus days given to the referrer when their referred user completes their first exam. */
  REFERRAL_BONUS_DAYS: numberFromEnv(1),

  LLM_PROVIDER: z.enum(['openai', 'grok', 'openrouter', 'gemini']).default('openai'),
  STT_PROVIDER: z.enum(['openai', 'grok']).default('openai'),

  /** When unset (with LLM_PROVIDER=openai), document analysis is disabled until configured. */
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default('gpt-4o-mini'),

  /** OpenAI speech-to-text model for Whisper (`audio.transcriptions.create`). */
  STT_MODEL: z.string().min(1).default('whisper-1'),

  /** xAI Grok API key — required when LLM_PROVIDER=grok for AI features. */
  GROK_API_KEY: z.string().min(1).optional(),
  GROK_MODEL: z.string().min(1).default('grok-4.3'),

  /** OpenRouter API key — required when LLM_PROVIDER=openrouter for AI features. */
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().min(1).default('deepseek/deepseek-r1'),

  /** Google Gemini API key — required when LLM_PROVIDER=gemini for AI features. */
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-pro'),

  /** Comma-separated list of Telegram user IDs that are allowed to use admin commands */
  ADMIN_IDS: z.string().optional().default(''),

  /** Application edition: 'commercial' (paid/public) or 'community' (free/private) */
  APP_EDITION: z.nativeEnum(AppEdition).default(AppEdition.COMMERCIAL),

  /** Comma-separated list of Telegram user IDs allowed to use the bot in 'community' edition */
  WHITELIST_USER_IDS: z.string().optional().default(''),

  /** Application mode: 'api' (bot webhooks) or 'worker' (background processing) */
  APP_MODE: z.enum(['api', 'worker', 'both']).default('both'),

  /** Telegram API URL. Defaults to https://api.telegram.org */
  TELEGRAM_API_URL: z.string().url().default('https://api.telegram.org'),

  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PAYMENT_LINK_EUR: z.string().url().optional(),
  STRIPE_PAYMENT_LINK_CZK: z.string().url().optional(),
  EXAM_PRICE_EUR: numberFromEnv(5),
  EXAM_PRICE_CZK: numberFromEnv(125),
  SUPPORT_USERNAME: z.string().min(1, 'SUPPORT_USERNAME is required'),

  /** Webhook URL for critical errors */
  SLACK_ERRORS_WEBHOOK_URL: optionalTrimmedUrl(),

  /** Webhook URL for daily statistics reports */
  SLACK_STATISTICS_WEBHOOK_URL: optionalTrimmedUrl(),

  /** OpenAI Admin API Key for usage monitoring */
  OPENAI_ADMIN_API_KEY: z.string().optional(),

  /** xAI Management API Key for billing */
  XAI_MANAGEMENT_KEY: z.string().optional(),

  /** xAI Team ID for billing */
  XAI_TEAM_ID: z.string().optional(),
  /* eslint-enable @typescript-eslint/naming-convention */
});

export const envSchema = baseEnvSchema
  .superRefine((data, ctx) => {
    if (data.USE_TEST_ENVIRONMENT) {
      if (!data.TEST_WEBHOOK_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: webhookUrlRequiredMessage,
          path: ['TEST_WEBHOOK_URL'],
        });
      }
      if (!data.TELEGRAM_TEST_BOT_TOKEN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'TELEGRAM_TEST_BOT_TOKEN is required when USE_TEST_ENVIRONMENT is true',
          path: ['TELEGRAM_TEST_BOT_TOKEN'],
        });
      }
    } else {
      if (!data.WEBHOOK_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: webhookUrlRequiredMessage,
          path: ['WEBHOOK_URL'],
        });
      }
      if (!data.TELEGRAM_BOT_TOKEN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'TELEGRAM_BOT_TOKEN is required when USE_TEST_ENVIRONMENT is false',
          path: ['TELEGRAM_BOT_TOKEN'],
        });
      }
    }
  })
  .transform((data) => {
    const adminIds = data.ADMIN_IDS.split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => {
        try {
          return BigInt(id);
        } catch {
          return 0n;
        }
      })
      .filter((id) => id > 0n);

    const whitelistUserIds = data.WHITELIST_USER_IDS.split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => {
        try {
          return BigInt(id);
        } catch {
          return 0n;
        }
      })
      .filter((id) => id > 0n);

    return {
      ...data,
      webhookUrl: data.USE_TEST_ENVIRONMENT ? data.TEST_WEBHOOK_URL! : data.WEBHOOK_URL!,
      telegramBotToken: data.USE_TEST_ENVIRONMENT ? data.TELEGRAM_TEST_BOT_TOKEN! : data.TELEGRAM_BOT_TOKEN!,
      queueName: data.USE_TEST_ENVIRONMENT ? 'exam-processing-test' : 'exam-processing',
      adminIds,
      appEdition: data.APP_EDITION,
      whitelistUserIds,
      stripeSecretKey: data.STRIPE_SECRET_KEY,
      stripeWebhookSecret: data.STRIPE_WEBHOOK_SECRET,
      stripePaymentLinkEur: data.STRIPE_PAYMENT_LINK_EUR,
      stripePaymentLinkCzk: data.STRIPE_PAYMENT_LINK_CZK,
      examPriceEur: data.EXAM_PRICE_EUR,
      examPriceCzk: data.EXAM_PRICE_CZK,
      supportUsername: data.SUPPORT_USERNAME,
      slackErrorsWebhookUrl: data.SLACK_ERRORS_WEBHOOK_URL,
      slackStatisticsWebhookUrl: data.SLACK_STATISTICS_WEBHOOK_URL,
      sttProvider: data.STT_PROVIDER,
      openaiAdminApiKey: data.OPENAI_ADMIN_API_KEY,
      xaiManagementKey: data.XAI_MANAGEMENT_KEY,
      xaiTeamId: data.XAI_TEAM_ID,
      openrouterApiKey: data.OPENROUTER_API_KEY,
      openrouterModel: data.OPENROUTER_MODEL,
      geminiApiKey: data.GEMINI_API_KEY,
      geminiModel: data.GEMINI_MODEL,
    };
  });
