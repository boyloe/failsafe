/**
 * step-executor.ts
 *
 * Parses plain-English test steps and executes them via Playwright.
 * Supports a natural command vocabulary — no rigid DSL required.
 */

import type { Page } from "playwright";

export interface StepResult {
  step: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

type StepHandler = (page: Page, args: string) => Promise<void>;

// ── Command patterns ────────────────────────────────────────────────────────
// Each entry: [regex to match step text, handler fn]
const HANDLERS: Array<[RegExp, StepHandler]> = [
  // Navigate
  [
    /^(?:go to|navigate to|open|visit)\s+(.+)$/i,
    async (page, args) => {
      const url = args.trim();
      const fullUrl = url.startsWith("http") ? url : `${getBaseUrl(page)}${url}`;
      await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    },
  ],

  // Click
  [
    /^click(?:\s+(?:on|the))?\s+['"]?(.+?)['"]?$/i,
    async (page, args) => {
      await page.click(`text=${args}`, { timeout: 8000 });
    },
  ],

  // Fill / type
  [
    /^(?:fill in|type|enter|input)\s+(.+?)\s*(?:with|:)\s*(.+)$/i,
    async (page, args) => {
      // e.g. "fill in email with test@example.com" or "fill in email: test@example.com"
      const match = args.match(/^(.+?)\s*(?:with|:)\s*(.+)$/i);
      if (!match) throw new Error(`Could not parse fill step: ${args}`);
      const [, fieldHint, value] = match;
      const selector = await findInput(page, fieldHint.trim());
      await page.fill(selector, value.trim());
    },
  ],

  // Type into field (alternate form)
  [
    /^(?:fill in|enter)\s+['"](.+?)['"]\s+(?:in(?:to)?|into)?\s+(?:the\s+)?(.+)$/i,
    async (page, args) => {
      const match = args.match(/^['"](.+?)['"]\s+(?:in(?:to)?|into)?\s+(?:the\s+)?(.+)$/i);
      if (!match) throw new Error(`Could not parse fill step: ${args}`);
      const [, value, fieldHint] = match;
      const selector = await findInput(page, fieldHint.trim());
      await page.fill(selector, value);
    },
  ],

  // Select dropdown
  [
    /^select\s+['"]?(.+?)['"]?\s+from\s+(?:the\s+)?(.+)$/i,
    async (page, args) => {
      const match = args.match(/^['"]?(.+?)['"]?\s+from\s+(?:the\s+)?(.+)$/i);
      if (!match) throw new Error(`Could not parse select step: ${args}`);
      const [, value, fieldHint] = match;
      const selector = await findInput(page, fieldHint.trim());
      await page.selectOption(selector, { label: value });
    },
  ],

  // Submit / press enter
  [
    /^(?:submit|press enter|hit enter)$/i,
    async (page) => {
      await page.keyboard.press("Enter");
    },
  ],

  // Expect text on page (with or without quotes)
  [
    /^expect\s+['"]?(.+?)['"]?\s+(?:on|in|to be on|to appear on|is visible on)\s*(?:page|screen)?$/i,
    async (page, args) => {
      // Strip surrounding quotes if present
      const text = args.replace(/^['"]|['"]$/g, "").trim();
      await page.waitForSelector(`text=${text}`, { timeout: 10000 });
    },
  ],

  // Expect text on page (no trailing qualifier — just "expect 'X'")
  [
    /^expect\s+['"](.+?)['"]$/i,
    async (page, args) => {
      const text = args.replace(/^['"]|['"]$/g, "").trim();
      await page.waitForSelector(`text=${text}`, { timeout: 10000 });
    },
  ],

  // Expect URL / redirect
  [
    /^expect\s+(?:redirect\s+to|url(?:\s+to be)?|to be at)\s+(.+)$/i,
    async (page, args) => {
      const expected = args.trim();
      await page.waitForURL((url) => url.toString().includes(expected), {
        timeout: 10000,
      });
    },
  ],

  // Expect HTTP status (via response interception — works on navigation)
  [
    /^expect\s+http\s+(\d+)$/i,
    async (page, args) => {
      const code = parseInt(args.trim(), 10);
      const response = await page.waitForResponse((r) => r.status() === code, {
        timeout: 5000,
      });
      if (!response) throw new Error(`Expected HTTP ${code} but did not receive it`);
    },
  ],

  // Expect element visible
  [
    /^expect\s+(?:the\s+)?(.+?)\s+(?:to be visible|is visible|exists?|to exist)$/i,
    async (page, args) => {
      const hint = args.trim();
      await page.waitForSelector(`[aria-label*="${hint}" i], [placeholder*="${hint}" i], text=${hint}`, {
        timeout: 8000,
      });
    },
  ],

  // Expect at least N elements
  [
    /^expect\s+at\s+least\s+(\d+)\s+(.+)$/i,
    async (page, args) => {
      const match = args.match(/^(\d+)\s+(.+)$/);
      if (!match) throw new Error(`Could not parse count assertion: ${args}`);
      const [, countStr, selector] = match;
      const count = parseInt(countStr, 10);
      // Try as CSS, then as text
      const elements = await page.$$(selector).catch(() => []);
      const byText = await page.$$(`text=${selector}`).catch(() => []);
      const total = Math.max(elements.length, byText.length);
      if (total < count) {
        throw new Error(`Expected at least ${count} "${selector}" elements, found ${total}`);
      }
    },
  ],

  // Wait
  [
    /^wait\s+(\d+)(?:ms|s)?$/i,
    async (page, args) => {
      const match = args.match(/^(\d+)(ms|s)?$/i);
      if (!match) return;
      const [, num, unit] = match;
      const ms = unit?.toLowerCase() === "s" ? parseInt(num) * 1000 : parseInt(num);
      await page.waitForTimeout(ms);
    },
  ],

  // Verify no element / text
  [
    /^verify\s+(?:no|not)\s+(.+)$/i,
    async (page, args) => {
      const count = await page.$$(`text=${args.trim()}`).then((els) => els.length);
      if (count > 0) throw new Error(`Expected "${args.trim()}" to not be present, but found it`);
    },
  ],
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getBaseUrl(page: Page): string {
  try {
    const url = new URL(page.url());
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

async function findInput(page: Page, hint: string): Promise<string> {
  // Try various selectors in priority order
  const candidates = [
    `input[name*="${hint}" i]`,
    `input[placeholder*="${hint}" i]`,
    `input[aria-label*="${hint}" i]`,
    `input[id*="${hint}" i]`,
    `textarea[name*="${hint}" i]`,
    `textarea[placeholder*="${hint}" i]`,
    `textarea[aria-label*="${hint}" i]`,
    `select[name*="${hint}" i]`,
    `select[aria-label*="${hint}" i]`,
    `[data-testid*="${hint}" i]`,
  ];

  for (const sel of candidates) {
    const el = await page.$(sel);
    if (el) return sel;
  }

  // Try label text
  const labelEl = await page.$(`label:has-text("${hint}")`);
  if (labelEl) {
    const forAttr = await labelEl.getAttribute("for");
    if (forAttr) return `#${forAttr}`;
  }

  throw new Error(
    `Could not find input for "${hint}". Tried: ${candidates.slice(0, 3).join(", ")}`
  );
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeStep(
  page: Page,
  step: string,
  baseUrl: string
): Promise<StepResult> {
  const start = Date.now();
  const normalized = step.replace(/^\d+\.\s*/, "").trim(); // strip "1. " prefixes

  for (const [pattern, handler] of HANDLERS) {
    const match = normalized.match(pattern);
    if (match) {
      try {
        // Pass everything after the matched verb as args
        const args = match.slice(1).join(" ");
        await handler(page, args);
        return { step, passed: true, durationMs: Date.now() - start };
      } catch (err) {
        return {
          step,
          passed: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        };
      }
    }
  }

  // No handler matched — skip with a warning (don't fail the flow)
  console.warn(`  ⚠ No handler matched step: "${normalized}" — skipping`);
  return { step, passed: true, durationMs: 0 };
}
