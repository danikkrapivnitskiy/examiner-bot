import 'reflect-metadata';
import { container } from 'tsyringe';
import type { Server } from 'node:http';

import express from 'express';
import { Bot, InlineKeyboard } from 'grammy';
// eslint-disable-next-line @typescript-eslint/naming-convention
import Stripe from 'stripe';

import { env } from './config/env';
import { AppEdition } from './config/app-edition.enum';
import { BotCommand, CallbackAction } from './config/bot-commands.enum';
import { initializeExaminerFfmpeg } from './infrastructure/media/ffmpeg.config';
import { getExaminerMessages, getMessage } from './config/i18n';
import { EvaluateExamAnswerUseCase } from './application/useCases/evaluateExamAnswer.useCase';
import { ExamPromptBuilderService } from './application/services/exam-prompt-builder.service';
import { FinishExamUseCase } from './application/useCases/finishExam.useCase';
import { LoadExamTurnContextUseCase } from './application/useCases/loadExamTurnContext.useCase';
import { ManageExamSessionUseCase } from './application/useCases/manageExamSession.useCase';
import { ProcessExamPipelineUseCase } from './application/useCases/processExamPipeline.useCase';
import { EnqueueExamPipelineUseCase } from './application/useCases/enqueueExamPipeline.useCase';
import { StartExamSessionUseCase } from './application/useCases/startExamSession.useCase';
import { UploadDocumentUseCase } from './application/useCases/uploadDocument.useCase';
import { ProcessVoiceAnswerUseCase } from './application/useCases/processVoiceAnswer.useCase';
import { AdminAddExamsUseCase } from './application/useCases/adminAddExams.useCase';
import { ExamSessionService } from './application/exam/examSession.service';
import { formatExamQuestionMessage } from './presentation/formatters/examQuestion.formatter';
import { createLlmClient, createSpeechToTextClient } from './infrastructure/llm/llm.factory';
import { createConsoleAppLogger } from './infrastructure/logging/consoleAppLogger.adapter';
import { createPrismaClient } from './infrastructure/persistence/prisma.client';
import { PrismaExamRepository } from './infrastructure/persistence/prismaExam.repository';
import { PrismaUserRepository } from './infrastructure/persistence/prismaUser.repository';
import { RedisExamStateCache } from './infrastructure/cache/redisExamState.cache';
import { RedisUserLockAdapter } from './infrastructure/cache/redisUserLock.adapter';
import { RedisUserPreferencesCache } from './infrastructure/cache/redisUserPreferences.cache';
import { QueueRedisConnectionProvider } from './infrastructure/cache/redisConnectionPool';
import { createRedis } from './infrastructure/cache/redis.client';
import { ExamQueue } from './infrastructure/queue/exam.queue';
import { ExamWorker } from './infrastructure/queue/exam.worker';
import { HttpTelegramFileDownloader } from './infrastructure/telegram/httpTelegramFileDownloader.adapter';
import { GrammyExamPipelineNotifier } from './infrastructure/telegram/grammyExamPipelineNotifier.adapter';
import { LocalFileStorage } from './infrastructure/storage/localFileStorage.adapter';
import { MammothPdfTextExtractor } from './infrastructure/text/mammothPdfTextExtractor.adapter';
import { registerDocumentHandler } from './presentation/handlers/document.handler';
import { registerTextHandler } from './presentation/handlers/text.handler';
import { registerVoiceHandler } from './presentation/handlers/voice.handler';
import { processExamAnswerFromUserText } from './presentation/handlers/examAnswerShared';
import { CommandHandlerFactory } from './presentation/handlers/commands/command-handler.factory';
import { AdminCommandHandler } from './presentation/handlers/commands/admin.command-handler';
import { BalanceCommandHandler } from './presentation/handlers/commands/balance.command-handler';
import { ChatIdCommandHandler } from './presentation/handlers/commands/chatid.command-handler';
import { InfoCommandHandler } from './presentation/handlers/commands/info.command-handler';
import { LanguageCommandHandler } from './presentation/handlers/commands/language.command-handler';
import { ReferralCommandHandler } from './presentation/handlers/commands/referral.command-handler';
import { StartExamCommandHandler } from './presentation/handlers/commands/start-exam.command-handler';
import { StatisticsCommandHandler } from './presentation/handlers/commands/statistics.command-handler';
import { PaymentsCommandHandler } from './presentation/handlers/commands/payments.command-handler';
import { createErrorMiddleware } from './presentation/middleware/error.middleware';
import { createRateLimitMiddleware } from './presentation/middleware/rateLimit.middleware';
import { createUserMiddleware } from './presentation/middleware/user.middleware';
import type { BotContext } from './presentation/context';

import { SlackClient } from './infrastructure/api/slack/slack.client';
import { RedisStatisticsRepository } from './infrastructure/repositories/redis-statistics.repository';
import { RedisQuotaRepository } from './infrastructure/repositories/redis-quota.repository';
import { OpenAIUsageMonitoringService } from './application/services/openai-usage-monitoring.service';
import { XaiUsageMonitoringService } from './application/services/xai-usage-monitoring.service';
import { StatisticsService } from './application/services/statistics.service';
import { ErrorReportingService } from './application/services/error-reporting.service';
import { DailyReportScheduler } from './infrastructure/scheduler/daily-report.scheduler';
import { TransactionReason, Currency } from './domain/enums/transaction.enum';

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function webhookPathFromUrl(webhookUrl: string): string {
  const pathname = new URL(webhookUrl).pathname;
  const trimmed = pathname !== '/' && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return trimmed === '' ? '/' : trimmed;
}

async function main(): Promise<void> {
  const logger = createConsoleAppLogger(env.LOG_LEVEL, env.NODE_ENV === 'production');
  container.registerInstance('IAppLogger', logger);

  initializeExaminerFfmpeg(logger);

  const redis = createRedis(env.REDIS_URL, logger);
  container.registerInstance('Redis', redis);

  const examStateCache = container.resolve(RedisExamStateCache);
  container.registerInstance('IExamStateCache', examStateCache);

  const userLock = container.resolve(RedisUserLockAdapter);
  container.registerInstance('IUserLock', userLock);

  const userPreferencesCache = container.resolve(RedisUserPreferencesCache);
  container.registerInstance('IUserPreferencesCache', userPreferencesCache);

  const queueRedisConnectionProvider = container.resolve(QueueRedisConnectionProvider);
  container.registerInstance('IQueueRedisConnectionProvider', queueRedisConnectionProvider);

  const prisma = createPrismaClient(env.NODE_ENV);
  container.registerInstance('PrismaClient', prisma);
  container.registerInstance('MAX_EXAMS_PER_USER', env.MAX_EXAMS_PER_USER);
  container.registerInstance('ADMIN_IDS', env.adminIds);

  const exams = container.resolve(PrismaExamRepository);
  container.registerInstance('IExamPipelineRepository', exams);
  container.registerInstance('IExamSessionRepository', exams);

  const users = container.resolve(PrismaUserRepository);
  container.registerInstance('IUserRepository', users);

  const llm = createLlmClient(env, logger);
  if (llm) {
    container.registerInstance('ILlmClient', llm);
  } else {
    container.register('ILlmClient', { useFactory: () => null });
  }

  const speechToText = createSpeechToTextClient(env);
  if (speechToText) {
    container.registerInstance('ISpeechToTextClient', speechToText);
  } else {
    container.register('ISpeechToTextClient', { useFactory: () => null });
  }

  if (!llm) {
    const keyHint = env.LLM_PROVIDER === 'grok' ? 'GROK_API_KEY is not set' : 'OPENAI_API_KEY is not set';
    logger.warn(`${keyHint}; material analysis and question generation are disabled`);
  }

  container.registerInstance('GENERATED_QUESTIONS_PER_EXAM', env.GENERATED_QUESTIONS_PER_EXAM);
  container.registerInstance('MAX_QUESTIONS_PER_SESSION', env.MAX_QUESTIONS_PER_EXAM_SESSION);
  const slackClient = container.resolve(SlackClient);
  container.registerInstance('SlackClient', slackClient);

  const statisticsRepo = container.resolve(RedisStatisticsRepository);
  container.registerInstance('IStatisticsRepository', statisticsRepo);

  const quotaRepo = container.resolve(RedisQuotaRepository);
  container.registerInstance('IQuotaRepository', quotaRepo);

  const openaiUsageService = container.resolve(OpenAIUsageMonitoringService);
  container.registerInstance('OpenAIUsageMonitoringService', openaiUsageService);

  const xaiUsageService = container.resolve(XaiUsageMonitoringService);
  container.registerInstance('XaiUsageMonitoringService', xaiUsageService);

  const statisticsService = container.resolve(StatisticsService);
  container.registerInstance('IStatisticsService', statisticsService);

  const manageExamSessions = container.resolve(ManageExamSessionUseCase);
  const startExamSession = container.resolve(StartExamSessionUseCase);
  const loadExamTurn = container.resolve(LoadExamTurnContextUseCase);
  const finishExam = container.resolve(FinishExamUseCase);

  const promptBuilder = container.resolve(ExamPromptBuilderService);
  container.registerInstance('IExamPromptBuilderService', promptBuilder);

  const evaluateAnswer = llm ? container.resolve(EvaluateExamAnswerUseCase) : null;

  const textExtractor = container.resolve(MammothPdfTextExtractor);
  container.registerInstance('ITextExtractor', textExtractor);

  const fileStorage = container.resolve(LocalFileStorage);
  container.registerInstance('IFileStorage', fileStorage);

  container.registerInstance('TELEGRAM_BOT_TOKEN', env.telegramBotToken);
  container.registerInstance('TELEGRAM_API_URL', env.TELEGRAM_API_URL);
  const telegramFiles = container.resolve(HttpTelegramFileDownloader);
  container.registerInstance('IFileDownloader', telegramFiles);

  const bot = new Bot<BotContext>(env.telegramBotToken);
  container.registerInstance('GrammyApi', bot.api);

  container.registerInstance('QUEUE_MAX_SIZE', env.QUEUE_MAX_SIZE);
  const examQueue = container.resolve(ExamQueue);
  container.registerInstance('IExamPipelineQueue', examQueue);
  await examQueue.initialize();

  const isApiMode = env.APP_MODE === 'api' || env.APP_MODE === 'both';
  const isWorkerMode = env.APP_MODE === 'worker' || env.APP_MODE === 'both';

  let examWorker: ExamWorker | undefined;
  if (isWorkerMode && llm) {
    const notifier = container.resolve(GrammyExamPipelineNotifier);
    container.registerInstance('IExamPipelineNotifier', notifier);

    const processExamPipeline = container.resolve(ProcessExamPipelineUseCase);
    container.registerInstance('ProcessExamPipelineUseCase', processExamPipeline);
    container.registerInstance('QUEUE_CONCURRENCY', env.QUEUE_CONCURRENCY);
    examWorker = container.resolve(ExamWorker);
    await examWorker.initialize();
  }

  if (!isApiMode) {
    logger.info('Running in WORKER ONLY mode. Bot webhooks will not be started.');

    const shutdownWorker = async (signal: string): Promise<void> => {
      logger.info(`Shutdown (${signal})`);
      if (examWorker) {
        await examWorker.close();
      }
      await examQueue.close();
      redis.disconnect();
      await prisma.$disconnect();
      process.exit(0);
    };

    process.once('SIGINT', () => void shutdownWorker('SIGINT'));
    process.once('SIGTERM', () => void shutdownWorker('SIGTERM'));

    // Keep process alive
    return new Promise(() => {});
  }

  container.registerInstance('IS_LLM_CONFIGURED', !!llm);
  const enqueuePipelineUseCase = container.resolve(EnqueueExamPipelineUseCase);
  container.registerInstance('EnqueueExamPipelineUseCase', enqueuePipelineUseCase);

  const errorReportingService = container.resolve(ErrorReportingService);
  container.registerInstance('ErrorReportingService', errorReportingService);

  const dailyReportScheduler = container.resolve(DailyReportScheduler);
  container.registerInstance('DailyReportScheduler', dailyReportScheduler);
  dailyReportScheduler.start();

  bot.use(createErrorMiddleware({ logger, errorReportingService }));
  bot.use(createUserMiddleware({ users, logger, userPrefs: userPreferencesCache, statisticsService }));

  if (env.appEdition === AppEdition.COMMUNITY) {
    bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (!userId || !env.whitelistUserIds.includes(BigInt(userId))) {
        const locale = ctx.locale || 'en';
        const examinerMessages = getExaminerMessages(locale);
        await ctx.reply(examinerMessages.accessDeniedCommunity);
        return;
      }
      await next();
    });
  }

  bot.use(createRateLimitMiddleware({ redis, logger }));

  const handlers = [
    new ChatIdCommandHandler(),
    new InfoCommandHandler(),
    new AdminCommandHandler(env.adminIds),
    new LanguageCommandHandler(),
    new StartExamCommandHandler(),
    new ReferralCommandHandler(),
    new BalanceCommandHandler(),
    new StatisticsCommandHandler(exams, env.RECENT_EXAMS_DISPLAY_LIMIT),
    new PaymentsCommandHandler(statisticsService),
  ];

  const adminAddExamsUseCase = container.resolve(AdminAddExamsUseCase);

  const commandFactory = new CommandHandlerFactory(
    handlers,
    userPreferencesCache,
    adminAddExamsUseCase,
    env.adminIds,
    logger
  );
  commandFactory.attachToBot(bot);

  const uploadDocument = container.resolve(UploadDocumentUseCase);

  registerDocumentHandler(bot, { uploadDocument, logger, quotaRepo });

  const examSessionService = container.resolve(ExamSessionService);
  container.registerInstance('ExamSessionService', examSessionService);

  registerTextHandler(bot, {
    examSessions: manageExamSessions,
    examSessionService,
    userLock,
    evaluateAnswer,
    finishExam,
    loadExamTurn,
    logger,
    statisticsService,
    quotaRepo,
  });

  const processVoiceAnswer = speechToText ? container.resolve(ProcessVoiceAnswerUseCase) : null;

  registerVoiceHandler(bot, {
    examSessions: manageExamSessions,
    examSessionService,
    userLock,
    evaluateAnswer,
    finishExam,
    loadExamTurn,
    logger,
    processVoiceAnswer,
    statisticsService,
    quotaRepo,
  });

  bot.callbackQuery('exam_next_question', async (ctx) => {
    const locale = ctx.locale;
    await ctx.answerCallbackQuery();

    if (ctx.callbackQuery.message) {
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      } catch {
        // Ignore if message is not modified
      }
    }

    if (!ctx.from) {
      return;
    }
    const userId = ctx.from.id;

    const dbUser = await ctx.getOrCreateDbUser().catch(() => null);
    if (!dbUser) {
      return;
    }

    const state = await manageExamSessions.getExamState(userId);
    if (!state) {
      return;
    }

    const lockAcquired = await userLock.acquireLock(userId, 120);
    if (!lockAcquired) {
      return;
    }

    try {
      // Simulate user saying they want to move on, so the LLM cleanly finishes the question
      await processExamAnswerFromUserText({
        ctx,
        deps: {
          examSessions: manageExamSessions,
          examSessionService,
          userLock,
          evaluateAnswer,
          finishExam,
          loadExamTurn,
          logger,
          statisticsService,
          quotaRepo,
        },
        userId,
        dbUserId: dbUser.id,
        state,
        userAnswer: "Let's move on to the next question.",
        locale,
      });
    } finally {
      await userLock.releaseLock(userId);
    }
  });

  bot.callbackQuery(/^exam:start:(.+)$/, async (ctx) => {
    const locale = ctx.locale;
    const examinerMessages = getExaminerMessages(locale);

    const examId = ctx.match?.[1]?.trim();
    if (!examId) {
      await ctx.answerCallbackQuery({
        text: examinerMessages.invalidExamAction,
        show_alert: false,
      });
      return;
    }

    const dbUser = await ctx.getOrCreateDbUser().catch(() => null);
    if (!dbUser || !ctx.from) {
      await ctx.answerCallbackQuery({
        text: examinerMessages.profileNotReadyCallback,
        show_alert: false,
      });
      return;
    }

    await ctx.answerCallbackQuery({ text: examinerMessages.startingExam, show_alert: false });

    try {
      const outcome = await startExamSession.execute({
        examId,
        telegramUserId: ctx.from.id,
        dbUserId: dbUser.id,
      });

      if (!outcome.ok) {
        await ctx.reply(examinerMessages.examNotAvailable);
        return;
      }

      const message = formatExamQuestionMessage({
        questionNumber: 1,
        totalQuestions: outcome.totalQuestions,
        questionText: outcome.firstQuestionText,
        locale,
      });

      const keyboard = new InlineKeyboard().text(examinerMessages.nextQuestionButton, 'exam_next_question');

      const sentMsg = await ctx.reply(message, { reply_markup: keyboard });

      const state = await manageExamSessions.getExamState(ctx.from.id);
      if (state) {
        state.lastQuestionMessageId = sentMsg.message_id;
        await manageExamSessions.setExamState(ctx.from.id, state);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to start exam session', { examId, error: message });
      await ctx.reply(getMessage(ctx, 'startExamError'));
    }
  });

  bot.command('start', async (ctx) => {
    const locale = ctx.locale;
    const examinerMessages = getExaminerMessages(locale);

    const welcomeText = examinerMessages.commandStartWelcome;
    await ctx.getOrCreateDbUser().catch(() => null);

    const keyboard = new InlineKeyboard()
      .text(examinerMessages.commandStartMenuInfo, 'cmd:info')
      .text(examinerMessages.commandStartMenuLanguage, 'cmd:language')
      .row()
      .text(examinerMessages.commandStartMenuStartExam, 'cmd:start_exam');

    await ctx.reply(welcomeText, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  });

  bot.callbackQuery(/^cmd:(.+)$/, async (ctx) => {
    const command = ctx.match[1];
    const handler = handlers.find((h) => {
      const cmds = Array.isArray(h.command) ? h.command : [h.command];
      return cmds.includes(command as BotCommand);
    });

    if (handler) {
      if (command === BotCommand.START_EXAM && env.appEdition !== AppEdition.COMMUNITY) {
        const dbUser = await ctx.getOrCreateDbUser().catch(() => null);
        if (dbUser && (!dbUser.subscriptionEndDate || dbUser.subscriptionEndDate < new Date())) {
          const messages = getExaminerMessages(ctx.locale);
          await ctx.answerCallbackQuery();
          const keyboard = new InlineKeyboard()
            .text(messages.referralMenuButton, CallbackAction.OPEN_REFERRAL_MENU)
            .text(messages.paymentMenuButton, CallbackAction.OPEN_PAYMENTS_MENU);
          await ctx.reply(messages.insufficientExamCredits, { reply_markup: keyboard });
          return;
        }
      }

      await ctx.answerCallbackQuery();
      try {
        await handler.handle(ctx);
      } catch (error) {
        logger.error(`Error handling callback command ${command}:`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      await ctx.answerCallbackQuery({ text: 'Command not found' });
    }
  });

  bot.catch((err) => {
    const wrapped = err.error;
    const errorMessage = wrapped instanceof Error ? wrapped.message : JSON.stringify(wrapped);
    const stack = wrapped instanceof Error ? wrapped.stack : undefined;
    const updateKeys = Object.keys(err.ctx.update).filter((updateField) => updateField !== 'update_id');
    logger.error('Unhandled bot error', {
      updateKinds: updateKeys,
      error: errorMessage,
      stack,
    });
  });

  const useTestWebhookProfile = env.USE_TEST_ENVIRONMENT;
  const webhookUrl = env.webhookUrl;
  const listenPort = useTestWebhookProfile ? env.TEST_PORT : env.PORT;

  let httpServer: Server | undefined;

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Shutdown (${signal})`);
    if (httpServer) {
      await closeHttpServer(httpServer);
      httpServer = undefined;
    }
    await bot.stop();
    if (examWorker) {
      await examWorker.close();
    }
    await examQueue.close();
    redis.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;
  const expressApp = express();

  const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey, { apiVersion: '2025-10-29.clover' }) : null;

  expressApp.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];

    if (!stripe || !env.stripeWebhookSecret || !sig) {
      res.status(400).send('Webhook Error: Missing configuration');
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body as string | Buffer, sig, env.stripeWebhookSecret);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Stripe webhook signature verification failed', { error: errorMessage });
      res.status(400).send(`Webhook Error: ${errorMessage}`);
      return;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id || session.metadata?.userId;
      const examsAmount = Number(session.metadata?.amount || 7);

      const amountTotalRaw = session.amount_total;
      if (amountTotalRaw === null || amountTotalRaw === undefined) {
        logger.error('Stripe webhook error: missing amount_total');
        res.status(400).send('Webhook Error: Missing amount_total');
        return;
      }
      const amountTotal = Number(amountTotalRaw) / 100; // Stripe amounts are in cents

      const currencyStr = session.currency?.toLowerCase();
      if (!currencyStr) {
        logger.error('Stripe webhook error: missing currency');
        res.status(400).send('Webhook Error: Missing currency');
        return;
      }

      if (!Object.values(Currency).includes(currencyStr as Currency)) {
        logger.error(`Stripe webhook error: unsupported currency ${currencyStr}`);
        res.status(400).send(`Webhook Error: Unsupported currency ${currencyStr}`);
        return;
      }
      const currency = currencyStr as Currency;

      // Create a transaction record for statistics
      if (userId && amountTotal > 0) {
        try {
          await statisticsService.trackPurchase(Number(userId), amountTotal, currency, TransactionReason.PAYMENT);
        } catch (err) {
          logger.error('Failed to create transaction record', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (userId) {
        const targetUserId = BigInt(userId);
        const outcome = await adminAddExamsUseCase.execute({ targetUserId, amount: examsAmount });

        if (outcome.ok) {
          const locale = (await userPreferencesCache.getUserLocale(targetUserId)) || 'en';
          const messages = getExaminerMessages(locale);
          await bot.api.sendMessage(Number(userId), messages.paymentSuccess(examsAmount));
        } else {
          logger.error('Failed to add exams after Stripe payment', { targetUserId: String(targetUserId) });
        }
      }
    }

    res.json({ received: true });
  });

  expressApp.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  expressApp.use(express.json());

  const mountPath = webhookPathFromUrl(webhookUrl);
  expressApp.post(mountPath, (req, res) => {
    const tokenHeader = req.headers['x-telegram-bot-api-secret-token'];
    if (webhookSecret && tokenHeader !== webhookSecret) {
      logger.warn('Unauthorized webhook attempt');
      res.status(401).send('Unauthorized');
      return;
    }

    // Immediately respond 200 OK to Telegram (Fire-and-Forget)
    res.status(200).send();

    const body = req.body as Record<string, unknown> | undefined;
    const updateId = body && typeof body.update_id === 'number' ? body.update_id : undefined;
    const kinds =
      body && typeof body === 'object' ? Object.keys(body).filter((bodyField) => bodyField !== 'update_id') : [];

    if (updateId === undefined) {
      logger.warn('Webhook POST body missing update_id after JSON parse', {
        contentType: req.headers['content-type'],
        hasBody: body !== undefined && body !== null,
      });
    } else {
      logger.debug('Telegram webhook POST received and offloaded to background', {
        updateId,
        kinds,
        webhookSecretConfigured: Boolean(webhookSecret),
      });
    }

    if (body) {
      // Process update in background
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- Express body is any
      bot.handleUpdate(body as any).catch((err: unknown) => {
        logger.error('Error handling update in background', {
          error: err instanceof Error ? err.message : String(err),
          updateId,
        });
      });
    }
  });

  /* eslint-disable @typescript-eslint/naming-convention -- Telegram Bot API payload */
  await bot.init();
  await bot.api.setWebhook(webhookUrl, {
    allowed_updates: ['message', 'edited_message', 'callback_query'],
    ...(webhookSecret ? { secret_token: webhookSecret } : {}),
  });

  const baseCommands = [
    { command: BotCommand.START, description: 'Start or restart the bot' },
    { command: BotCommand.START_EXAM, description: 'Generate exam from a file' },
    { command: BotCommand.LANGUAGE, description: 'Change bot language' },
    { command: BotCommand.BALANCE, description: 'Check subscription status' },
    { command: BotCommand.STATISTICS, description: 'View your exam history' },
    { command: BotCommand.PAYMENTS, description: 'Get Premium subscription' },
    { command: BotCommand.INFO, description: 'How to use this bot' },
    { command: BotCommand.REF, description: 'Invite friends for bonuses' },
    { command: BotCommand.ID, description: 'Show your Telegram ID' },
  ];

  await bot.api.setMyCommands(baseCommands);

  const adminCommands = [...baseCommands, { command: BotCommand.ADMIN, description: '[Admin] Open admin menu' }];

  for (const adminId of env.adminIds) {
    try {
      await bot.api.setMyCommands(adminCommands, {
        scope: { type: 'chat', chat_id: Number(adminId) },
      });
    } catch (error) {
      logger.warn(`Could not set admin commands for chat ${adminId.toString()}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  /* eslint-enable @typescript-eslint/naming-convention */

  await new Promise<void>((resolve) => {
    httpServer = expressApp.listen(listenPort, () => {
      logger.info('Examiner bot webhook server listening', { port: listenPort, webhookUrl });
      resolve();
    });
  });
}

main().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
  // eslint-disable-next-line no-console
  console.error('Fatal error during startup', { error: errorMessage });
  process.exit(1);
});
