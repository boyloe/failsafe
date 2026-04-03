/**
 * alert-queue.ts
 *
 * DB-backed alert queue with exponential backoff retry.
 * Alerts are written to alert_queue first, then a processor
 * drains PENDING items — retrying on failure up to maxAttempts.
 *
 * Backoff: 1m → 5m → 15m → 60m → 240m
 */

import { PrismaClient, AlertChannel, AlertQueueStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { sendEmailAlert, sendTelegramAlert, sendSlackAlert, type AlertPayload } from "./alerts";
import { runnerLogger } from "../src/lib/logger";

// Retry delays in minutes: attempt 1→2→3→4→5
const BACKOFF_MINUTES = [1, 5, 15, 60, 240];

function nextRetryDelay(attempt: number): number {
  return (BACKOFF_MINUTES[attempt] ?? 240) * 60 * 1000;
}

// ── Enqueue ───────────────────────────────────────────────────────────────────

export async function enqueueAlert(
  prisma: PrismaClient,
  channel: AlertChannel,
  destination: string,
  payload: AlertPayload
): Promise<void> {
  await prisma.alertQueue.create({
    data: {
      channel,
      destination,
      payload: payload as object,
      status: AlertQueueStatus.PENDING,
      nextRetryAt: new Date(),
    },
  });
  runnerLogger.info("Alert enqueued", { channel, destination });
}

// ── Process due items ─────────────────────────────────────────────────────────

export async function processAlertQueue(prisma: PrismaClient): Promise<void> {
  const due = await prisma.alertQueue.findMany({
    where: {
      status: AlertQueueStatus.PENDING,
      nextRetryAt: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  if (due.length === 0) return;

  runnerLogger.info("Processing alert queue", { count: due.length });

  for (const item of due) {
    const payload = item.payload as AlertPayload;
    // Rehydrate Date (JSON loses type)
    payload.ranAt = new Date(payload.ranAt);

    try {
      switch (item.channel) {
        case AlertChannel.EMAIL:
          await sendEmailAlert(item.destination, payload);
          break;
        case AlertChannel.TELEGRAM:
          await sendTelegramAlert(item.destination, payload);
          break;
        case AlertChannel.SLACK:
          await sendSlackAlert(item.destination, payload);
          break;
      }

      await prisma.alertQueue.update({
        where: { id: item.id },
        data: { status: AlertQueueStatus.DELIVERED, updatedAt: new Date() },
      });

      runnerLogger.info("Alert delivered", {
        id: item.id,
        channel: item.channel,
        attempts: item.attempts + 1,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = item.attempts + 1;
      const exhausted = attempts >= item.maxAttempts;
      const delayMs = nextRetryDelay(attempts);
      const nextRetryAt = new Date(Date.now() + delayMs);

      await prisma.alertQueue.update({
        where: { id: item.id },
        data: {
          attempts,
          lastError: message,
          status: exhausted ? AlertQueueStatus.FAILED : AlertQueueStatus.PENDING,
          nextRetryAt: exhausted ? new Date() : nextRetryAt,
          updatedAt: new Date(),
        },
      });

      if (exhausted) {
        runnerLogger.error("Alert permanently failed — max attempts reached", {
          id: item.id,
          channel: item.channel,
          destination: item.destination,
          error: message,
        });
      } else {
        runnerLogger.warn("Alert delivery failed — will retry", {
          id: item.id,
          channel: item.channel,
          attempt: attempts,
          nextRetryAt: nextRetryAt.toISOString(),
          error: message,
        });
      }
    }
  }
}
