# Future improvements

## PgBouncer for Connection Pooling

When scaling to thousands of users and running multiple API and Worker instances, Prisma's default connection pool will quickly exhaust PostgreSQL's connection limits.

- Deploy **PgBouncer** in transaction pooling mode in front of your PostgreSQL database.
- Update `DATABASE_URL` to point to PgBouncer and append `?pgbouncer=true&connection_limit=5` (or whatever limit makes sense per instance).
- This allows horizontal scaling of Node.js instances without overwhelming the database with idle connections.

## Temporary Files Management

Currently, the bot uses a local `tmp` directory (`process.cwd() + '/tmp'`) to store downloaded files during processing. While this is safer than `os.tmpdir()` for Docker deployments, it can still cause issues under high load.

- **Implement directory size limits:** Add a pre-flight check (e.g., `checkTempDirectoryLimit(500)`) before downloading files to prevent disk overflow attacks.
- **Add background cleanup:** Implement a Cron job or BullMQ repeatable job to periodically delete files older than 24 hours to prevent disk leaks if a worker crashes before the `finally` cleanup block executes.
- **Docker tmpfs:** When deploying, consider mounting the `tmp` directory as a `tmpfs` volume in `docker-compose.yml` to keep these files entirely in RAM and avoid disk I/O bottlenecks.

## OCR Integration for Scanned Documents (Tesseract)

Currently, the bot relies on text extraction libraries (`pdf-parse`, `mammoth`) that require documents to have a selectable text layer. Scanned PDFs or images are rejected with a `ScannedDocumentError`.

For a future iteration, consider integrating an Optical Character Recognition (OCR) engine like **Tesseract** (or cloud alternatives like Yandex Vision / Google Cloud Vision) to support these files.

**Trade-offs to consider:**
- **Infrastructure complexity:** Tesseract requires system-level dependencies and consumes significant RAM and CPU.
- **Processing time:** OCR is slow and will increase the time it takes to prepare an exam.
- **Text quality:** Poor quality scans can result in "garbage" text, leading the LLM to generate nonsensical questions.

**MVP Recommendation:** Keep the current behavior. Rejecting scanned documents and asking the user to run them through an OCR tool themselves (e.g., ILovePDF) saves server resources and keeps the architecture simple.

Move LLM traffic to [OpenRouter](https://openrouter.ai/) for a **unified OpenAI-compatible API** across providers.

- Use one client surface (same endpoints and shapes); swap models via configuration instead of branching integrations.
- Prefer **plain output**: avoid markup-heavy prompting where structured parsing is brittle; align prompts and parsers with minimal formatting assumptions.
- Implement **fallback**: primary model fails or rate-limits → retry with a configured secondary model or graceful degradation so users still get a response when possible.

Pricing and model availability: [OpenRouter pricing](https://openrouter.ai/pricing).

### Model routing

| Workflow | Model | Rationale |
|----------|--------|-----------|
| Question bank generation | **GPT-5.4 mini** | Runs rarely (e.g. batch); quality matters more than latency. |
| Answer evaluation | **Grok 4.1 Fast** | Runs per request; optimize for speed and low cost. |

## Supabase migrations automation

Automate applying database migrations in CI/CD (e.g. **GitHub Actions**) so deploys stay reproducible and compatible with environments that rely on **IPv6** connectivity to Supabase where applicable—see [Supabase Migrations Guide](#supabase-migrations-guide) below.

## Supabase Migrations Guide

This guide explains why Prisma migration commands may hang or fail against Supabase from a typical home network, and how to apply schema changes safely using SQL generation or CI/CD.

### Why `prisma migrate dev` hangs or fails with `P1001`

Supabase exposes PostgreSQL in two main ways:

1. **Direct connection** — host typically listens on port **5432**. For hosted Supabase projects, traffic often prefers **IPv6**. Many residential ISPs and home routers provide **IPv4 only**, so your machine cannot complete a TCP connection to the database host. Prisma then reports **`P1001` Can't reach database server** or appears to hang while timing out.

2. **Pooler (Transaction mode)** — Supabase recommends this for serverless clients and often documents it with port **6543**. Prisma **`migrate dev`** and **`migrate deploy`** expect behaviors that align with a normal PostgreSQL session (including advisory locks and migration history writes). The transaction pooler can be incompatible or unreliable for migrations, so teams commonly point **`DATABASE_URL`** at the direct URL for migrations—which brings you back to the IPv6 requirement on networks that lack it.

So the failure mode is environmental (IPv6 routing), not necessarily a bug in Prisma or Supabase.

### Manual workaround: generate SQL and run it in the Supabase SQL Editor

When you cannot open a stable direct connection from your laptop, you can still produce the SQL Prisma would apply by using **`prisma migrate diff`**. Review the script, then paste and execute it in the [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql) (or run it via another environment that can reach the database).

Run these commands from the **`examiner-bot`** project root (where `prisma/schema.prisma` lives).

#### Full schema SQL from an empty database

Use this when you want a script that reflects the entire current datamodel as if starting from nothing (for documentation or greenfield setups—**never run blindly against a database that already has data**):

```bash
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > migration.sql
```

Open `migration.sql`, verify every statement, then run it in the Supabase SQL Editor.

#### Incremental SQL (recommended when `prisma/migrations` already exists)

Compare **committed migration history** to your **current** `schema.prisma` to emit SQL for changes not yet captured in migrations:

```bash
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --script > pending-changes.sql
```

Again: inspect `pending-changes.sql` before executing it.

#### Optional: compare database URL to schema (only if your machine can reach the DB)

If you temporarily have connectivity (another network, VPN, or IPv6):

```bash
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > drift-or-upgrades.sql
```

#### Keeping migration files in sync with the team

After you apply SQL manually in Supabase, your **`prisma/migrations`** folder on disk should stay aligned with what production actually ran. Options:

- Prefer creating a named migration locally when possible (`prisma migrate dev --name …`), even if you only copy the generated SQL into Supabase by hand; commit the migration folder so CI and teammates share one history.

- If you skipped `migrate dev` entirely, coordinate with your team so the SQL Editor steps are reflected in new migration files under `prisma/migrations` before merging.

### Automated solution for production: CI/CD with IPv6

Hosted runners such as **GitHub Actions** generally have working **IPv6** (and stable egress). Use them to run **`prisma migrate deploy`** against Supabase’s **direct** connection string so migrations apply consistently without relying on your home ISP.

Typical steps:

1. Store **`DATABASE_URL`** (direct connection URI from Supabase **Project Settings → Database**) in CI secrets—not in the repository.

2. In the workflow, install dependencies, run **`npx prisma migrate deploy`** from `examiner-bot` (or set `working-directory`), using that secret.

Minimal example:

```yaml
jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: examiner-bot/package-lock.json
      - name: Run Prisma migrations
        working-directory: examiner-bot
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: npx prisma migrate deploy
```

Use **`migrate deploy`** in CI—**not** `migrate dev`—because `migrate dev` is interactive and tied to local shadow-database workflows.

### Summary

| Situation | Approach |
|-----------|-----------|
| Local machine, no IPv6 to port 5432 | Use **`prisma migrate diff`** → review SQL → Supabase SQL Editor |
| Production / staging | **`prisma migrate deploy`** in CI (e.g. GitHub Actions) with direct **`DATABASE_URL`** |
| Everyday dev with working direct connectivity | **`npx prisma migrate dev`** as usual |

For application queries at runtime, many deployments still use Supabase’s **pooler** URL in **`DATABASE_URL`** while reserving **`directUrl`** (when configured) or a separate secret for migrations-only jobs—match whatever split your team agrees on and document it in deployment configuration.
