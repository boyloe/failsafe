/**
 * scheduler.ts
 *
 * Main entry point for the QA test runner.
 * Runs as a persistent background process — checks which flows are due,
 * runs them, saves results, and fires alerts.
 *
 * Usage:
 *   npx tsx runner/scheduler.ts
 *
 * Or via cron (runs every 15 min, scheduler handles interval logic internally):
 *   [every 15 min] cd /path/to/qa-dashboard && npx tsx runner/scheduler.ts
 */

import "dotenv/config";
import cron from "node-cron";
import path from "path";
import { PrismaClient, Plan, TestStatus } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { runFlow } from "./run-flow";
import { sendEmailAlert, sendTelegramAlert, sendSlackAlert } from "./alerts";

// ── DB setup ─────────────────────────────────────────────────────────────────

const dbPath = path.resolve(process.cwd(), "dev.db");
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

// ── Plan → interval mapping ──────────────────────────────────────────────────

const PLAN_INTERVALS: Record<Plan, number> = {
  STARTER: 24 * 60,     // every 24 hours (minutes)
  PRO: 60,              // every 1 hour
  ENTERPRISE: 15,       // every 15 minutes
};

// ── Core runner ───────────────────────────────────────────────────────────────

async function runDueFlows(): Promise<void> {
  console.log(`\n[${new Date().toISOString()}] 🔍 Checking for due flows...`);

  // Load all active flows with their client, user, last result, and alert config
  const flows = await prisma.testFlow.findMany({
    where: { isActive: true },
    include: {
      client: {
        include: {
          user: {
            include: { accounts: false },
          },
        },
      },
      results: {
        orderBy: { ranAt: "desc" },
        take: 1,
      },
    },
  });

  const now = Date.now();
  let ran = 0;

  for (const flow of flows) {
    const user = flow.client.user;
    const intervalMinutes = PLAN_INTERVALS[user.plan];
    const intervalMs = intervalMinutes * 60 * 1000;

    const lastRun = flow.results[0]?.ranAt;
    const isDue = !lastRun || now - new Date(lastRun).getTime() >= intervalMs;

    if (!isDue) continue;

    const timeSince = lastRun
      ? `${Math.round((now - new Date(lastRun).getTime()) / 60000)}m ago`
      : "never";

    console.log(`\n▶ Running: "${flow.name}" (${flow.client.name}) — last run: ${timeSince}`);

    let steps: string[];
    try {
      steps = JSON.parse(flow.steps) as string[];
    } catch {
      console.error(`  ✗ Invalid steps JSON for flow ${flow.id}`);
      continue;
    }

    const result = await runFlow(flow.id, flow.name, flow.client.url, steps);
    ran++;

    console.log(
      `  ${result.status === "PASS" ? "✅" : "❌"} ${result.status} in ${result.durationMs}ms`
    );

    // Save result to DB
    await prisma.testResult.create({
      data: {
        flowId: flow.id,
        status: result.status as TestStatus,
        durationMs: result.durationMs,
        error: result.error ?? null,
        screenshot: result.screenshotPath ?? null,
        rawLog: JSON.stringify(result.stepResults),
      },
    });

    // ── Alert logic ──────────────────────────────────────────────────────────
    const prevStatus = flow.results[0]?.status;
    const nowFailing = result.status !== "PASS";
    const wasFailingBefore = prevStatus && prevStatus !== "PASS";
    const justRecovered = wasFailingBefore && result.status === "PASS";
    const newFailure = nowFailing && !wasFailingBefore;

    if (newFailure || justRecovered) {
      // Open or resolve incident
      if (newFailure) {
        await prisma.incident.create({
          data: {
            flowId: flow.id,
            title: `${flow.name} is failing on ${flow.client.name}`,
            description: result.error ?? "Unknown failure",
            status: "OPEN",
          },
        });
        console.log(`  🚨 New incident created`);
      } else if (justRecovered) {
        await prisma.incident.updateMany({
          where: { flowId: flow.id, status: "OPEN" },
          data: { status: "RESOLVED", resolvedAt: new Date() },
        });
        console.log(`  ✅ Incident resolved`);
      }

      // Load alert config
      const alertConfig = await prisma.alertConfig.findUnique({
        where: { userId: user.id },
      });

      const alertPayload = {
        clientName: flow.client.name,
        clientUrl: flow.client.url,
        flowName: flow.name,
        status: justRecovered ? ("RECOVERED" as const) : ("FAIL" as const),
        error: result.error,
        durationMs: result.durationMs,
        ranAt: new Date(),
      };

      // Fire alerts
      if (alertConfig?.email && user.email) {
        await sendEmailAlert(user.email, alertPayload).catch((err) =>
          console.error(`  Email alert error: ${err}`)
        );
      }

      if (alertConfig?.telegram) {
        await sendTelegramAlert(alertConfig.telegram, alertPayload).catch((err) =>
          console.error(`  Telegram alert error: ${err}`)
        );
      }

      if (alertConfig?.slack) {
        await sendSlackAlert(alertConfig.slack, alertPayload).catch((err) =>
          console.error(`  Slack alert error: ${err}`)
        );
      }
    }
  }

  console.log(
    `\n[${new Date().toISOString()}] ✓ Done — ran ${ran}/${flows.length} flows`
  );
}

// ── Cron schedule ─────────────────────────────────────────────────────────────
//
// Runs every 15 minutes. The runDueFlows() fn handles which flows are actually
// due based on each user's plan interval — so Enterprise clients get checked
// every tick, Pro every hour, Starter once a day.

const SCHEDULE = "*/15 * * * *";

console.log("🚀 QA Monitor runner started");
console.log(`📅 Schedule: ${SCHEDULE}`);
console.log(`🗃  DB: ${dbPath}\n`);

// Run immediately on start
runDueFlows().catch(console.error);

// Then on schedule
cron.schedule(SCHEDULE, () => {
  runDueFlows().catch(console.error);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("\n👋 Runner shutting down...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("\n👋 Runner shutting down...");
  await prisma.$disconnect();
  process.exit(0);
});
