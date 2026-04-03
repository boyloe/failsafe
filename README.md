# Failsafe

> AI-powered automated QA testing for websites. Define your critical user flows in plain English — we run them on schedule and alert you instantly when something breaks.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://typescriptlang.org)
[![Playwright](https://img.shields.io/badge/Playwright-headless-green?logo=playwright)](https://playwright.dev)
[![Stripe](https://img.shields.io/badge/Stripe-subscriptions-purple?logo=stripe)](https://stripe.com)

---

## What It Does

Failsafe watches your website so you don't have to. You describe what should work ("go to /checkout, fill in email, click submit, expect 'Order confirmed'") and the system runs those steps automatically — daily, hourly, or every 15 minutes depending on your plan.

When something breaks, you get an alert in seconds. In plain English. With a screenshot.

**Built to run autonomously** — once configured, zero human intervention required.

---

## Features

- **Plain-English test flows** — no code required to define tests
- **Real browser testing** — Playwright + Chromium, not synthetic pings
- **Multi-channel alerts** — Email (Resend), Telegram, Slack
- **DB-backed alert queue** — exponential backoff retry, survives process restarts
- **Incident tracking** — automatic open/resolve lifecycle
- **Recovery detection** — alerts when a failing flow starts passing again
- **Structured logging** — Winston JSON logs in production, colorized in dev
- **Health check endpoint** — `/api/health` with DB ping and uptime
- **Stripe subscriptions** — three-tier pricing, billing portal included
- **Magic link auth** — no passwords, NextAuth v5
- **Dashboard** — overview, client management, flow history

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL via Prisma 7 |
| DB Adapter | `@prisma/adapter-pg` |
| Auth | NextAuth v5 (magic link) |
| Email | Resend |
| Browser | Playwright + Chromium headless |
| Payments | Stripe (subscriptions) |
| Logging | Winston (JSON in prod, colorized in dev) |
| Process mgr | PM2 |
| Runtime | Node.js 22 |

---

## Project Structure

```
qa-dashboard/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Landing page
│   │   ├── login/page.tsx              # Magic link sign-in
│   │   ├── dashboard/
│   │   │   ├── layout.tsx              # Auth-gated sidebar layout
│   │   │   ├── page.tsx                # Overview (stats + recent runs)
│   │   │   ├── clients/
│   │   │   │   ├── page.tsx            # Client list + add form
│   │   │   │   └── [clientId]/page.tsx # Client detail + flow management
│   │   │   └── settings/
│   │   │       ├── page.tsx            # Billing + alert config
│   │   │       ├── PlanCard.tsx        # Stripe upgrade card
│   │   │       └── AlertConfigForm.tsx # Alert preferences form
│   │   └── api/
│   │       ├── auth/[...nextauth]/     # NextAuth handler
│   │       ├── health/                 # Health check endpoint
│   │       └── stripe/
│   │           ├── checkout/           # Create Stripe checkout session
│   │           └── webhook/            # Handle Stripe webhook events
│   └── lib/
│       ├── prisma.ts                   # Prisma client singleton (pg adapter)
│       ├── logger.ts                   # Winston logger + subsystem children
│       ├── auth.ts                     # NextAuth config
│       └── stripe.ts                   # Stripe client + helpers
├── runner/
│   ├── scheduler.ts                    # Main cron entry point
│   ├── run-flow.ts                     # Playwright flow executor
│   ├── step-executor.ts                # Plain-English step parser
│   ├── alerts.ts                       # Email (Resend) / Telegram / Slack senders
│   └── alert-queue.ts                  # DB-backed queue with retry + backoff
├── prisma/
│   ├── schema.prisma                   # DB schema
│   └── seed.ts                         # Demo data seeder
├── ecosystem.config.js                 # PM2 process config
└── logs/                               # PM2 log output
```

---

## Getting Started

### Prerequisites

- Node.js 22+
- PostgreSQL database (we use [Supabase](https://supabase.com) free tier)
- A [Resend](https://resend.com) account for email alerts
- A Telegram bot token (for alerts) — create via [@BotFather](https://t.me/botfather)
- A Stripe account (test mode is fine to start)

### 1. Clone & install

```bash
git clone https://github.com/boyloe/failsafe.git
cd failsafe
npm install
```

### 2. Install Playwright browser

```bash
npx playwright install chromium
```

On Ubuntu 24.04, you'll also need system dependencies:

```bash
sudo apt-get install -y \
  libnspr4 libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 \
  libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 \
  libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64
```

### 3. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

See [Environment Variables](#environment-variables) for details.

### 4. Set up the database

```bash
npx prisma db push
npx prisma generate
```

Optionally seed demo data:

```bash
npx tsx prisma/seed.ts
```

### 5. Run in development

```bash
# Dashboard (Next.js)
npm run dev -- --port 3001

# Test runner (separate terminal)
npx tsx runner/scheduler.ts
```

### 6. Run in production (PM2)

```bash
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # follow the printed instructions
```

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Database (PostgreSQL)
DATABASE_URL="postgresql://user:password@host:5432/dbname"

# NextAuth
AUTH_SECRET="your-random-secret-here"    # generate with: openssl rand -base64 32
NEXTAUTH_URL="https://yourdomain.com"

# Email — Resend (https://resend.com)
RESEND_API_KEY="re_..."
EMAIL_FROM="Failsafe <alerts@yourdomain.com>"
# Note: without a custom domain, use: "Failsafe <onboarding@resend.dev>"

# Stripe
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_PUBLISHABLE_KEY="pk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_STARTER_PRICE_ID="price_..."
STRIPE_PRO_PRICE_ID="price_..."
STRIPE_ENTERPRISE_PRICE_ID="price_..."

# Telegram (for failure alerts)
TELEGRAM_BOT_TOKEN="your-bot-token"

# App
NEXT_PUBLIC_APP_URL="https://yourdomain.com"
```

> **Note:** Never commit `.env` to git. It's in `.gitignore`.

---

## Health Check

The `/api/health` endpoint returns system status:

```bash
curl https://yourdomain.com/api/health
```

```json
{
  "status": "ok",
  "timestamp": "2026-04-03T21:27:30.167Z",
  "uptime": 3600.5,
  "checks": {
    "database": {
      "status": "ok",
      "latencyMs": 42
    }
  }
}
```

Returns `200` when healthy, `503` when degraded (e.g. DB unreachable).

---

## Defining Test Flows

Test steps are written in plain English, one per line. The step executor supports a natural vocabulary:

### Navigation
```
Navigate to /checkout
Go to https://example.com/login
Visit /products
```

### Interactions
```
Click "Add to cart"
Click the checkout button
Fill in email: test@example.com
Fill in password: hunter2
Select "United States" from the country dropdown
```

### Assertions
```
Expect "Order confirmed" on page
Expect "Welcome back" on page
Expect redirect to /dashboard
Expect HTTP 200
Expect at least 3 .product-card elements
```

### Utilities
```
Wait 2000ms
Verify no "Error" on page
```

Steps that don't match any pattern are skipped with a warning (not failed), so you can add comments or notes freely.

---

## Pricing Tiers

| Plan | Price | Sites | Flows | Interval |
|---|---|---|---|---|
| Starter | $29/mo | 1 | 3 | Daily |
| Pro | $99/mo | 3 | 10 | Hourly |
| Enterprise | $299/mo | Unlimited | Unlimited | 15 min |

---

## How the Runner Works

The scheduler (`runner/scheduler.ts`) runs as a persistent process via PM2. Every 15 minutes it:

1. Loads all active test flows from the DB
2. Checks which flows are due based on the client's plan interval
3. Runs due flows via Playwright (headless Chromium)
4. Saves results (pass/fail/error, duration, error message, screenshot path)
5. Detects state changes:
   - **New failure** → creates incident, enqueues alerts
   - **Recovery** → resolves incident, enqueues recovery alert

A separate cron (every 1 minute) drains the alert queue:
- Attempts delivery via Resend / Telegram / Slack
- On failure: retries with exponential backoff (1m → 5m → 15m → 60m → 240m)
- After 5 failed attempts: marks permanently FAILED and logs clearly

---

## Alert Channels

### Email (Resend)
Set `RESEND_API_KEY` in `.env`. Sends HTML emails with error details and a dashboard link. Reliable delivery via Resend's API — no SMTP config needed.

### Telegram
Set `TELEGRAM_BOT_TOKEN` in `.env`. Users add their Telegram chat ID in the Settings page. Alerts include flow name, client, error message, and timestamp.

### Slack
Add an incoming webhook URL in the Settings page. Sends formatted attachments with color-coded status.

---

## Stripe Webhook Setup

Register your webhook endpoint in the Stripe dashboard:

```
POST https://yourdomain.com/api/stripe/webhook
```

Events to enable:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

The webhook handler automatically upgrades/downgrades user plans in the DB and fires a Telegram alert on payment failure.

---

## Database Schema

Core models:

- **User** — auth, plan tier, Stripe customer ID
- **Client** — website being monitored (belongs to user)
- **TestFlow** — named sequence of steps (belongs to client)
- **TestResult** — individual run outcome (pass/fail/error, duration, error, screenshot)
- **Incident** — open/resolved failure events (created automatically)
- **AlertConfig** — per-user alert preferences (email, Telegram, Slack)
- **AlertQueue** — queued alerts with retry state (channel, destination, payload, attempts, backoff)

---

## Deployment Notes

The dashboard can be deployed to Vercel (recommended) or kept on the VPS. The test runner **must** stay on the VPS — it needs Playwright/Chromium and runs as a persistent process.

If deploying dashboard to Vercel:
1. Add all env vars in Vercel project settings
2. Update `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to your production domain
3. Update the Stripe webhook URL to your Vercel domain
4. Keep the runner on the VPS pointing to the same PostgreSQL DB

---

## Development Notes

- **Prisma 7**: The `url` property in `datasource db {}` is no longer supported. Connection config lives in `prisma.config.ts`. Use `@prisma/adapter-pg` and pass `new PrismaPg({ connectionString })` to the `PrismaClient` constructor.
- **Database migrations**: Use `npx prisma db push` for schema changes during development (avoids migration history conflicts). Set up proper `migrate` workflow before production launch.
- **Tailwind v4**: Uses `@import "tailwindcss"` and `@theme {}` blocks instead of the v3 config file. Requires `@source` directives in `globals.css` for utility classes to compile.
- **NextAuth v5**: Uses `auth()` server-side instead of `getServerSession()`. Session callbacks receive `user` not `token`.
- **Ubuntu 24.04**: Several apt packages were renamed with `t64` suffix (`libatk1.0-0t64`, `libasound2t64`, etc.).
- **Logging**: All subsystems use Winston child loggers (`runnerLogger`, `stripeLogger`, etc.) — never `console.log` in production code.

---

## License

MIT
