import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StepResult } from "../runner/step-executor";

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  runnerLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Playwright mock ───────────────────────────────────────────────────────────

const mockScreenshot = vi.fn().mockResolvedValue(Buffer.alloc(0));
const mockGoto = vi.fn().mockResolvedValue(undefined);
const mockContextClose = vi.fn().mockResolvedValue(undefined);
const mockBrowserClose = vi.fn().mockResolvedValue(undefined);

function makeMockPage() {
  return { goto: mockGoto, screenshot: mockScreenshot };
}

function makeMockContext(page = makeMockPage()) {
  return { newPage: vi.fn().mockResolvedValue(page), close: mockContextClose };
}

function makeMockBrowser(context = makeMockContext()) {
  return { newContext: vi.fn().mockResolvedValue(context), close: mockBrowserClose };
}

vi.mock("playwright", () => ({
  chromium: { launch: vi.fn() },
}));

// ── step-executor mock ────────────────────────────────────────────────────────
// Isolate run-flow from step-executor; step-executor has its own test suite.

const mockExecuteStep = vi.fn();

vi.mock("../runner/step-executor", () => ({
  executeStep: mockExecuteStep,
}));

// ── fs mock ───────────────────────────────────────────────────────────────────

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
  };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runFlow", () => {
  let runFlow: (
    flowId: string,
    flowName: string,
    baseUrl: string,
    steps: string[]
  ) => Promise<import("../runner/run-flow").FlowRunResult>;

  let chromium: { launch: ReturnType<typeof vi.fn> };

  const passStep = (step: string): StepResult => ({ step, passed: true, durationMs: 10 });
  const failStep = (step: string, error = "Timeout"): StepResult => ({
    step,
    passed: false,
    error,
    durationMs: 10,
  });

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // mockReset (not clearAllMocks) is needed to flush any leftover mockResolvedValueOnce queue
    // from a previous test without wiping the default implementations of other mocks.
    mockExecuteStep.mockReset();
    ({ runFlow } = await import("../runner/run-flow"));
    ({ chromium } = await import("playwright"));
  });

  it("returns PASS when all steps pass", async () => {
    const browser = makeMockBrowser();
    vi.mocked(chromium.launch).mockResolvedValue(browser as any);
    mockExecuteStep.mockResolvedValue(passStep("click Submit"));

    const result = await runFlow("flow-1", "Test Flow", "https://example.com", ["click Submit"]);

    expect(result.status).toBe("PASS");
    expect(result.error).toBeUndefined();
  });

  it("returns FAIL when a step fails, with a formatted error message", async () => {
    const browser = makeMockBrowser();
    vi.mocked(chromium.launch).mockResolvedValue(browser as any);
    mockExecuteStep.mockResolvedValue(failStep("click Ghost", "Element not found"));

    const result = await runFlow("flow-1", "Test Flow", "https://example.com", ["click Ghost"]);

    expect(result.status).toBe("FAIL");
    expect(result.error).toContain("click Ghost");
    expect(result.error).toContain("Element not found");
  });

  it("stops executing after the first failed step", async () => {
    const browser = makeMockBrowser();
    vi.mocked(chromium.launch).mockResolvedValue(browser as any);
    mockExecuteStep
      .mockResolvedValueOnce(failStep("step 1"))
      .mockResolvedValueOnce(passStep("step 2"));

    await runFlow("flow-1", "Test Flow", "https://example.com", ["step 1", "step 2"]);

    expect(mockExecuteStep).toHaveBeenCalledOnce();
  });

  it("returns ERROR when the browser fails to launch", async () => {
    vi.mocked(chromium.launch).mockRejectedValue(new Error("no chromium binary"));

    const result = await runFlow("flow-1", "Test Flow", "https://example.com", ["click X"]);

    expect(result.status).toBe("ERROR");
    expect(result.error).toContain("no chromium binary");
    expect(result.stepResults).toHaveLength(0);
  });

  it("returns FAIL when the initial navigation to baseUrl fails", async () => {
    mockGoto.mockRejectedValueOnce(new Error("net::ERR_NAME_NOT_RESOLVED"));
    const browser = makeMockBrowser();
    vi.mocked(chromium.launch).mockResolvedValue(browser as any);

    const result = await runFlow(
      "flow-1",
      "Test Flow",
      "https://unreachable.invalid",
      ["click X"]
    );

    expect(result.status).toBe("FAIL");
    expect(result.error).toContain("Failed to reach");
    expect(result.stepResults).toHaveLength(0);
  });

  it("includes stepResults in the PASS result", async () => {
    const browser = makeMockBrowser();
    vi.mocked(chromium.launch).mockResolvedValue(browser as any);
    mockExecuteStep.mockResolvedValue(passStep("navigate to /"));

    const result = await runFlow("flow-1", "Test Flow", "https://example.com", ["navigate to /"]);

    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0].step).toBe("navigate to /");
  });

  it("captures a screenshot on step failure", async () => {
    const browser = makeMockBrowser();
    vi.mocked(chromium.launch).mockResolvedValue(browser as any);
    mockExecuteStep.mockResolvedValue(failStep("click Ghost"));

    const result = await runFlow("flow-1", "Test Flow", "https://example.com", ["click Ghost"]);

    expect(result.status).toBe("FAIL");
    expect(mockScreenshot).toHaveBeenCalled();
  });

  it("reports durationMs > 0 for successful runs", async () => {
    const browser = makeMockBrowser();
    vi.mocked(chromium.launch).mockResolvedValue(browser as any);
    mockExecuteStep.mockResolvedValue(passStep("submit"));

    const result = await runFlow("flow-1", "Test Flow", "https://example.com", ["submit"]);

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("always closes the browser, even when an error is thrown", async () => {
    vi.mocked(chromium.launch).mockResolvedValue(makeMockBrowser() as any);
    mockExecuteStep.mockRejectedValue(new Error("crash"));

    await runFlow("flow-1", "Test Flow", "https://example.com", ["click X"]);

    expect(mockBrowserClose).toHaveBeenCalled();
  });
});
