# AI Examiner

**Turn study materials into an interactive oral exam inside Telegram — upload a document, answer AI-generated questions by voice or text, get a scored report.**

AI Examiner reads PDF and DOCX uploads, builds a knowledge map and question bank with an LLM, then runs a structured Q&A session. Answers can be typed or spoken (Whisper / Grok STT). When the session ends, the bot sends a score and feedback. Processing runs in a background worker so the Telegram webhook stays responsive.

## Try it (local, ~5 minutes)

```bash
cp .env.example .env   # fill in tokens and database URLs
npm ci
npx prisma migrate deploy
npm run dev            # API mode — webhook server on PORT (default 3000)
```

In a second terminal, run the worker that processes document uploads:

```bash
npm run dev:worker     # APP_MODE=worker — BullMQ consumer
```

You also need **PostgreSQL**, **Redis**, and a **Telegram bot token** from [@BotFather](https://t.me/BotFather). See [Configuration](#configuration) for the full variable list.

Production uses Docker with separate `bot-api` and `exam-worker` services — see [Deployment](#deployment).

## How it works

```
User uploads PDF/DOCX
        │
        ▼
  Telegram webhook (Grammy)
        │
        ▼
  Enqueue job ──► Redis / BullMQ ──► Worker
        │                              │
        │                              ├─ Extract text (PDF / DOCX)
        │                              ├─ LLM: analyze material
        │                              ├─ LLM: generate question bank
        │                              └─ Mark exam READY → notify user
        ▼
  User starts exam → questions one by one
        │
        ├─ Text answer  ──► LLM evaluation → next question
        └─ Voice answer ──► STT → LLM evaluation → next question
        ▼
  Final report (score + feedback) persisted in PostgreSQL
```

The codebase follows **clean architecture**:

| Layer | Path | Responsibility |
|-------|------|----------------|
| Domain | `src/domain/` | Entities, errors, pure rules |
| Application | `src/application/` | Use cases, ports, prompts |
| Infrastructure | `src/infrastructure/` | Prisma, Redis, LLM clients, Telegram |
| Presentation | `src/presentation/` | Grammy handlers and middleware |

Dependency injection uses **TSyringe**. Configuration is validated at startup with **Zod** (`src/config/schemas/env.schema.ts`).

## Features

- **Document pipeline** — PDF and DOCX text extraction, token-size guard, scanned-PDF detection
- **Exam session** — shuffled question pool, per-answer LLM scoring, final report generation
- **Voice answers** — audio trimmed for STT via FFmpeg; OpenAI Whisper or Grok transcription
- **Multiple LLM backends** — OpenAI, Grok (xAI), OpenRouter, Gemini (`LLM_PROVIDER`)
- **i18n** — English and Russian UI (`src/config/i18n/`)
- **Quotas & subscriptions** — daily exam limits, referral bonuses, optional Stripe payments
- **Observability** — structured logging, optional Slack daily reports, OpenAI/xAI usage monitoring

## Configuration

Copy `.env.example` to `.env`. Required variables depend on mode:

| Variable | Purpose |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Production bot token |
| `WEBHOOK_URL` | Full HTTPS URL Telegram POSTs updates to |
| `DATABASE_URL` | PostgreSQL connection (Supabase pooler supported) |
| `REDIS_URL` | Redis for exam state, queues, rate limits |
| `LLM_PROVIDER` | `openai` \| `grok` \| `openrouter` \| `gemini` |
| `OPENAI_API_KEY` / `GROK_API_KEY` / … | Provider key matching `LLM_PROVIDER` |
| `STT_PROVIDER` | `openai` \| `grok` for voice transcription |

Optional but recommended in production:

- `TELEGRAM_WEBHOOK_SECRET` — validates incoming webhook requests
- `DIRECT_URL` — direct Postgres URL for `prisma migrate` (when pooler blocks migrations)
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` — subscription payments

Set `USE_TEST_ENVIRONMENT=true` to swap in `TELEGRAM_TEST_BOT_TOKEN`, `TEST_PORT`, and `TEST_WEBHOOK_URL` for isolated testing.

Validate config without starting the bot:

```bash
npm run config:validate
```

## Deployment

**Docker Compose (production):**

```bash
docker compose -f docker-compose.production.yml up -d --build
npm run webhook:set    # registers WEBHOOK_URL with Telegram
npm run check:status   # health, queue, env sanity checks
```

Two containers share the same image:

- `bot-api` — `APP_MODE=api`, Express webhook + Grammy
- `exam-worker` — `APP_MODE=worker`, BullMQ document pipeline

Helper scripts in `scripts/`:

| Script | Purpose |
|--------|---------|
| `deploy-code.sh` | Rolling code deploy |
| `update-config.sh` | Reload `.env` without full rebuild |
| `docker-build-push.sh` | Build and push image |
| `set-webhook.sh` | Register Telegram webhook from `.env` |

## Development

```bash
npm run lint
npm run typecheck
npm run test
npm run format:check
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, npm audit, and Docker build on `main`.

Useful scripts:

```bash
npm run script:analyze-test-pdfs   # token metrics on test PDFs
npx prisma studio                  # inspect database
```

## Project layout

```
examiner-bot/
├── src/
│   ├── application/     # use cases, prompts (*.prompt.md)
│   ├── domain/          # entities and errors
│   ├── infrastructure/  # adapters (LLM, Redis, Prisma, queue)
│   └── presentation/    # Grammy handlers
├── prisma/              # schema and migrations
├── tests/               # Jest unit/integration tests
├── scripts/             # deploy and ops helpers
└── .env.example         # documented environment template
```

LLM prompt templates live in `src/application/prompts/` and are copied to `dist/` on build.

## Limitations

- Large documents are rejected when estimated tokens exceed `MAX_DOCUMENT_ESTIMATED_TOKENS` (default 50 000).
- Scanned PDFs without extractable text are rejected with a user-facing error.
- Voice STT quality depends on the chosen provider and audio length; very long clips are trimmed before transcription.
- Payment and admin features require optional env vars and a configured database schema.

## License

MIT — see `package.json`.
