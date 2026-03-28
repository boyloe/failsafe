/**
 * run-flow.ts
 *
 * Executes a single test flow against a client URL.
 * Returns a structured result with pass/fail, duration, error message, screenshot path.
 */

import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { executeStep, type StepResult } from "./step-executor";

export interface FlowRunResult {
  status: "PASS" | "FAIL" | "ERROR";
  durationMs: number;
  error?: string;
  screenshotPath?: string;
  stepResults: StepResult[];
}

const SCREENSHOTS_DIR = path.resolve(process.cwd(), "runner/screenshots");

export async function runFlow(
  flowId: string,
  flowName: string,
  baseUrl: string,
  steps: string[]
): Promise<FlowRunResult> {
  const start = Date.now();

  // Ensure screenshots dir exists
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (compatible; QAMonitor/1.0; +https://qamonitor.app)",
    });

    const page = await context.newPage();

    // Navigate to base URL first to establish context
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    } catch (err) {
      const durationMs = Date.now() - start;
      const screenshotPath = await captureScreenshot(page, flowId);
      return {
        status: "FAIL",
        durationMs,
        error: `Failed to reach ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
        screenshotPath,
        stepResults: [],
      };
    }

    // Execute each step
    const stepResults: StepResult[] = [];
    let failedStep: StepResult | null = null;

    for (const step of steps) {
      console.log(`  → ${step}`);
      const result = await executeStep(page, step, baseUrl);
      stepResults.push(result);

      if (!result.passed) {
        failedStep = result;
        console.log(`  ✗ FAILED: ${result.error}`);
        break;
      }
      console.log(`  ✓ ${result.durationMs}ms`);
    }

    const durationMs = Date.now() - start;

    if (failedStep) {
      const screenshotPath = await captureScreenshot(page, flowId);
      await context.close();

      return {
        status: "FAIL",
        durationMs,
        error: buildErrorMessage(failedStep),
        screenshotPath,
        stepResults,
      };
    }

    await context.close();
    return { status: "PASS", durationMs, stepResults };
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ RUNNER ERROR: ${message}`);
    return {
      status: "ERROR",
      durationMs,
      error: `Test runner crashed: ${message}`,
      stepResults: [],
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function captureScreenshot(
  page: { screenshot: (opts: object) => Promise<Buffer> },
  flowId: string
): Promise<string | undefined> {
  try {
    const filename = `${flowId}-${Date.now()}.png`;
    const filePath = path.join(SCREENSHOTS_DIR, filename);
    await page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  } catch {
    return undefined;
  }
}

function buildErrorMessage(step: StepResult): string {
  return `Step failed: "${step.step}"\n\n${step.error ?? "Unknown error"}`;
}
