import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface HealthStatus {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  uptime: number;
  checks: {
    database: { status: "ok" | "error"; latencyMs?: number; error?: string };
  };
}

export async function GET() {
  const start = Date.now();
  const result: HealthStatus = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: { status: "ok" },
    },
  };

  // Database ping
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    result.checks.database = {
      status: "ok",
      latencyMs: Date.now() - dbStart,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Health check: database ping failed", { error: message });
    result.checks.database = { status: "error", error: message };
    result.status = "degraded";
  }

  const httpStatus = result.status === "ok" ? 200 : 503;
  logger.info("Health check", { status: result.status, durationMs: Date.now() - start });

  return NextResponse.json(result, { status: httpStatus });
}
