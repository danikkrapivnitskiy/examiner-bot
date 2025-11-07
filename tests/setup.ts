import 'reflect-metadata';

// Silence pdf2json / pdf.js internal util logging in Jest (see pdf2json readme).
process.env.PDF2JSON_DISABLE_LOGS = '1';

// Set required environment variables for tests
process.env.USE_TEST_ENVIRONMENT = 'true';
process.env.DATABASE_URL = 'mock_database_url';
process.env.REDIS_URL = 'mock_redis_url';
process.env.SUPPORT_USERNAME = 'mock_support_username';
process.env.WEBHOOK_URL = 'https://mock.webhook.url';
process.env.TEST_WEBHOOK_URL = 'https://mock.webhook.url';
process.env.TELEGRAM_BOT_TOKEN = 'mock_bot_token';
process.env.TELEGRAM_TEST_BOT_TOKEN = 'mock_test_bot_token';

// Polyfill for DOMMatrix (pdf.js fork inside pdf2json may reference it in some builds)
if (typeof (global as any).DOMMatrix === 'undefined') {
  (global as any).DOMMatrix = class DOMMatrix {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
    constructor() {
      this.a = 1;
      this.b = 0;
      this.c = 0;
      this.d = 1;
      this.e = 0;
      this.f = 0;
    }
  };
}
