import 'reflect-metadata';
import { createConsoleAppLogger } from '../src/infrastructure/logging/consoleAppLogger.adapter';
import { SlackClient } from '../src/infrastructure/api/slack/slack.client';
import { env } from '../src/config/env';

async function main() {
  console.log('Starting Slack reporting test...');

  const logger = createConsoleAppLogger('debug', false);
  
  if (!env.slackErrorsWebhookUrl && !env.slackStatisticsWebhookUrl) {
    console.error('No Slack webhooks configured in .env');
    process.exit(1);
  }

  const slackClient = new SlackClient(logger);

  console.log('Sending test error...');
  await slackClient.sendError({
    name: 'TestError',
    message: 'This is a test error from the examiner bot to verify Slack integration',
    code: 'TEST_001',
    context: {
      userId: 123456,
      operation: 'test_script'
    }
  });

  console.log('Sending test daily report...');
  await slackClient.sendDailyReport({
    date: new Date().toISOString().split('T')[0],
    newUsers: 15,
    activeUsers: 42,
    referralsCount: 5,
    examsCompleted: 120,
    questionsAnswered: 1200,
    paymentsOpened: 35,
    purchases: {
      count: 3,
      amountsByCurrency: {
        eur: 15,
        czk: 0
      }
    },
    topUsers: [
      { userId: 111, username: 'test_user1', examsCount: 10 },
      { userId: 222, username: 'test_user2', examsCount: 8 }
    ],
    openai: {
      totalRequests: 1500,
      totalTokens: 450000,
      totalCost: 2.5
    },
    errors: {
      total: 5,
      critical: 1,
      warnings: 4,
      byType: [
        { type: 'TestError', count: 5 }
      ]
    }
  });

  console.log('Test completed successfully!');
}

main().catch(console.error);