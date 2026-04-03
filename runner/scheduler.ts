/**
 * scheduler.ts
 *
 * Main entry point for the QA test runner.
 * Runs as a persistent background process — checks which flows are due,
 * runs them, saves results, and fires alerts.
 *
 * Usage:
 *   npx tsx runner/scheduler.ts
 */

import "dotenv/config";
import cron from "node-cron";
import { PrismaClient, Plan, TestStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { runFlow } from "./run-flow";
import { sendEmailAlert, sendTelegramAlert, sendSlackAlert } from "./alerts";
import { runnerLogger } from "../src/lib/logger";

// ── DB setup ─────────────────────────────────────────────────────────────────

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── Plan → interval mapping ──────────────────────────────────────────────────

const PLAN_INTERVALS: Record<Plan, number> = {
  STARTER: 24 * 60,  // every 24 hours (minutes)
  PRO: 60,           // every 1 hour
  ENTERPRISE: 15,    // every 15 minutes
};

// ── Core runner ───────────────────────────────────────────────────────────────

async function runDueFlows(): Promise<void> {
  runnerLogger.info("Checking for due flows");

  const flows = await prisma.testFlow.findMany({
    where: { isActive: true },
    include: {
      client: {
        include: {
          user: { include: { accounts: false } },
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
    const intervalMs = PLAN_INTERVALS[user.plan] * 60 * 1000;

    const lastRun = flow.results[0]?.ranAt;
    const isDue = !lastRun || now - new Date(lastRun).getTime() >= intervalMs;

    if (!isDue) continue;

    const timeSince = lastRun
      ? `${Math.round((now - new Date(lastRun).getTime()) / 60000)}m ago`
      : "never";

    runnerLogger.info("Running flow", {
      flow: flow.name,
      client: flow.client.name,
      lastRun: timeSince,
    });

    let steps: string[];
    try {
      steps = JSON.parse(flow.steps) as string[];
    } catch {
      runnerLogger.error("Invalid steps JSON", { flowId: flow.id });
      continue;
    }

    const result = await runFlow(flow.id, flow.name, flow.client.url, steps);
    ran++;

    runnerLogger.info("Flow complete", {
      flow: flow.name,
      status: result.status,
      durationMs: result.durationMs,
      error: result.error,
    });

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
      if (newFailure) {
        await prisma.incident.create({
          data: {
            flowId: flow.id,
            title: `${flow.name} is failing on ${flow.client.name}`,
            description: result.error ?? "Unknown failure",
            status: "OPEN",
          },
        });
        runnerLogger.warn("New incident created", { flow: flow.name, client: flow.client.name });
      } else if (justRecovered) {
        await prisma.incident.updateMany({
          where: { flowId: flow.id, status: "OPEN" },
          data: { status: "RESOLVED", resolvedAt: new Date() },
        });
        runnerLogger.info("Incident resolved", { flow: flow.name });
      }

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

      if (alertConfig?.email && user.email) {
        await sendEmailAlert(user.email, alertPayload).catch((err) =>
          runnerLogger.error("Email alert failed", { error: err instanceof Error ? err.message : String(err) })
        );
      }

      if (alertConfig?.telegram) {
        await sendTelegramAlert(alertConfig.telegram, alertPayload).catch((err) =>
          runnerLogger.error("Telegram alert failed", { error: err instanceof Error ? err.message : String(err) })
        );
      }

      if (alertConfig?.slack) {
        await sendSlackAlert(alertConfig.slack, alertPayload).catch((err) =>
          runnerLogger.error("Slack alert failed", { error: err instanceof Error ? err.message : String(err) })
        );
      }
    }
  }

  runnerLogger.info("Run complete", { ran, total: flows.length });
}

// ── Cron schedule ─────────────────────────────────────────────────────────────

const SCHEDULE = "*/15 * * * *";

runnerLogger.info("Runner started", { schedule: SCHEDULE, db: "postgresql (Supabase)" });

// Run immediately on start
runDueFlows().catch((err) => runnerLogger.error("runDueFlows crashed", { error: err.message }));

// Then on schedule
cron.schedule(SCHEDULE, () => {
  runDueFlows().catch((err) => runnerLogger.error("runDueFlows crashed", { error: err.message }));
});

// Graceful shutdown
async function shutdown() {
  runnerLogger.info("Runner shutting down");
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
