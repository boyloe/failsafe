import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Page } from "playwright";
import { executeStep } from "../runner/step-executor";

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  runnerLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  dbLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  authLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  stripeLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Mock page factory ────────────────────────────────────────────────────────

function makePage(overrides: Record<string, unknown> = {}): Page {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue(undefined),
    keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForURL: vi.fn().mockResolvedValue(undefined),
    waitForResponse: vi.fn().mockResolvedValue({ status: () => 200 }),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    $$: vi.fn().mockResolvedValue([]),
    $: vi.fn().mockResolvedValue(null),
    url: vi.fn().mockReturnValue("https://example.com/"),
    screenshot: vi.fn().mockResolvedValue(Buffer.alloc(0)),
    ...overrides,
  } as unknown as Page;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("executeStep", () => {
  describe("prefix stripping", () => {
    it("strips a numbered prefix before matching the step", async () => {
      const page = makePage();
      const result = await executeStep(page, "1. Navigate to /home", "https://example.com");
      expect(result.passed).toBe(true);
      expect(vi.mocked(page.goto)).toHaveBeenCalledWith(
        "https://example.com/home",
        expect.any(Object)
      );
    });

    it("works without a numbered prefix", async () => {
      const page = makePage();
      const result = await executeStep(page, "Navigate to /home", "https://example.com");
      expect(result.passed).toBe(true);
    });
  });

  describe("navigate", () => {
    it("calls page.goto with an absolute URL as-is", async () => {
      const page = makePage();
      await executeStep(page, "Navigate to https://other.com/path", "https://example.com");
      expect(vi.mocked(page.goto)).toHaveBeenCalledWith(
        "https://other.com/path",
        expect.objectContaining({ waitUntil: "domcontentloaded" })
      );
    });

    it("prepends the page's origin for relative paths", async () => {
      const page = makePage();
      await executeStep(page, "Navigate to /checkout", "https://example.com");
      expect(vi.mocked(page.goto)).toHaveBeenCalledWith(
        "https://example.com/checkout",
        expect.any(Object)
      );
    });

    it("matches all trigger words: go to, open, visit", async () => {
      for (const verb of ["go to /a", "open /a", "visit /a"]) {
        const page = makePage();
        const result = await executeStep(page, verb, "https://example.com");
        expect(result.passed).toBe(true);
        expect(vi.mocked(page.goto)).toHaveBeenCalled();
      }
    });
  });

  describe("click", () => {
    it("calls page.click with a text selector", async () => {
      const page = makePage();
      await executeStep(page, "Click 'Submit'", "https://example.com");
      expect(vi.mocked(page.click)).toHaveBeenCalledWith(
        "text=Submit",
        expect.objectContaining({ timeout: 8000 })
      );
    });

    it("handles 'click on' and 'click the' variants", async () => {
      for (const step of ["click on Add to cart", "click the button"]) {
        const page = makePage();
        const result = await executeStep(page, step, "https://example.com");
        expect(result.passed).toBe(true);
        expect(vi.mocked(page.click)).toHaveBeenCalled();
      }
    });

    it("returns passed=false when click throws", async () => {
      const page = makePage({ click: vi.fn().mockRejectedValue(new Error("not found")) });
      const result = await executeStep(page, "Click 'Ghost'", "https://example.com");
      expect(result.passed).toBe(false);
      expect(result.error).toMatch(/not found/);
    });
  });

  describe("fill", () => {
    it("finds input and fills with 'with' separator", async () => {
      const page = makePage({
        $: vi.fn().mockImplementation((sel: string) =>
          sel.includes("email") ? Promise.resolve({}) : Promise.resolve(null)
        ),
      });
      const result = await executeStep(
        page,
        "fill in email with test@example.com",
        "https://example.com"
      );
      expect(result.passed).toBe(true);
      expect(vi.mocked(page.fill)).toHaveBeenCalledWith(
        expect.stringContaining("email"),
        "test@example.com"
      );
    });

    it("finds input and fills with colon separator", async () => {
      const page = makePage({
        $: vi.fn().mockImplementation((sel: string) =>
          sel.includes("email") ? Promise.resolve({}) : Promise.resolve(null)
        ),
      });
      const result = await executeStep(
        page,
        "fill in email: test@example.com",
        "https://example.com"
      );
      expect(result.passed).toBe(true);
      expect(vi.mocked(page.fill)).toHaveBeenCalledWith(
        expect.stringContaining("email"),
        "test@example.com"
      );
    });

    it("returns passed=false when no matching input found", async () => {
      const page = makePage({ $: vi.fn().mockResolvedValue(null) });
      const result = await executeStep(
        page,
        "fill in xyznonexistent with value",
        "https://example.com"
      );
      expect(result.passed).toBe(false);
      expect(result.error).toMatch(/Could not find input/);
    });

    it("handles alternate form: fill in 'value' into the fieldName", async () => {
      const page = makePage({
        $: vi.fn().mockImplementation((sel: string) =>
          sel.includes("password") ? Promise.resolve({}) : Promise.resolve(null)
        ),
      });
      const result = await executeStep(
        page,
        'fill in "secret123" into the password',
        "https://example.com"
      );
      expect(result.passed).toBe(true);
      expect(vi.mocked(page.fill)).toHaveBeenCalledWith(
        expect.stringContaining("password"),
        "secret123"
      );
    });
  });

  describe("select", () => {
    it("calls selectOption with the label value", async () => {
      const page = makePage({
        $: vi.fn().mockImplementation((sel: string) =>
          sel.includes("country") ? Promise.resolve({}) : Promise.resolve(null)
        ),
      });
      const result = await executeStep(
        page,
        "select Canada from the country",
        "https://example.com"
      );
      expect(result.passed).toBe(true);
      expect(vi.mocked(page.selectOption)).toHaveBeenCalledWith(
        expect.stringContaining("country"),
        { label: "Canada" }
      );
    });
  });

  describe("submit / press enter", () => {
    it("presses Enter on 'submit'", async () => {
      const page = makePage();
      const result = await executeStep(page, "submit", "https://example.com");
      expect(result.passed).toBe(true);
      expect(vi.mocked(page.keyboard.press)).toHaveBeenCalledWith("Enter");
    });

    it("presses Enter on 'press enter'", async () => {
      const page = makePage();
      await executeStep(page, "press enter", "https://example.com");
      expect(vi.mocked(page.keyboard.press)).toHaveBeenCalledWith("Enter");
    });

    it("presses Enter on 'hit enter'", async () => {
      const page = makePage();
      await executeStep(page, "hit enter", "https://example.com");
      expect(vi.mocked(page.keyboard.press)).toHaveBeenCalledWith("Enter");
    });
  });

  describe("expect text on page", () => {
    it("waits for text selector with 'on page' qualifier", async () => {
      const page = makePage();
      await executeStep(page, "expect Welcome on page", "https://example.com");
      expect(vi.mocked(page.waitForSelector)).toHaveBeenCalledWith(
        "text=Welcome",
        expect.any(Object)
      );
    });

    it("waits for text selector with quoted text, no qualifier", async () => {
      const page = makePage();
      await executeStep(page, "expect 'Order confirmed'", "https://example.com");
      expect(vi.mocked(page.waitForSelector)).toHaveBeenCalledWith(
        "text=Order confirmed",
        expect.any(Object)
      );
    });

    it("strips surrounding quotes from expected text", async () => {
      const page = makePage();
      await executeStep(page, 'expect "Thank you" on page', "https://example.com");
      expect(vi.mocked(page.waitForSelector)).toHaveBeenCalledWith(
        "text=Thank you",
        expect.any(Object)
      );
    });

    it("returns passed=false when waitForSelector throws", async () => {
      const page = makePage({
        waitForSelector: vi.fn().mockRejectedValue(new Error("timeout")),
      });
      const result = await executeStep(page, "expect 'Missing text'", "https://example.com");
      expect(result.passed).toBe(false);
      expect(result.error).toMatch(/timeout/);
    });
  });

  describe("expect URL", () => {
    it("waits for URL to include the expected path", async () => {
      const page = makePage();
      await executeStep(page, "expect redirect to /dashboard", "https://example.com");
      expect(vi.mocked(page.waitForURL)).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ timeout: 10000 })
      );
    });

    it("the URL predicate matches URLs containing the expected string", async () => {
      const page = makePage();
      await executeStep(page, "expect url to be /success", "https://example.com");
      const [predicate] = vi.mocked(page.waitForURL).mock.calls[0] as [Function, unknown];
      expect(predicate(new URL("https://example.com/success"))).toBe(true);
      expect(predicate(new URL("https://example.com/fail"))).toBe(false);
    });
  });

  describe("expect HTTP status", () => {
    it("waits for a response matching the given status code", async () => {
      const page = makePage({
        waitForResponse: vi.fn().mockResolvedValue({ status: () => 200 }),
      });
      const result = await executeStep(page, "expect http 200", "https://example.com");
      expect(result.passed).toBe(true);
      const [predicate] = vi.mocked(page.waitForResponse).mock.calls[0] as [Function, unknown];
      expect(predicate({ status: () => 200 })).toBe(true);
      expect(predicate({ status: () => 404 })).toBe(false);
    });
  });

  describe("expect element visible", () => {
    it("waits for a compound selector using the hint", async () => {
      const page = makePage();
      await executeStep(page, "expect the search bar to be visible", "https://example.com");
      expect(vi.mocked(page.waitForSelector)).toHaveBeenCalledWith(
        expect.stringContaining("search bar"),
        expect.objectContaining({ timeout: 8000 })
      );
    });
  });

  describe("expect at least N elements", () => {
    it("passes when enough elements found by CSS selector", async () => {
      const page = makePage({
        $$: vi.fn().mockImplementation((sel: string) =>
          sel.startsWith("text=") ? Promise.resolve([]) : Promise.resolve([{}, {}, {}])
        ),
      });
      const result = await executeStep(
        page,
        "expect at least 2 .product-card",
        "https://example.com"
      );
      expect(result.passed).toBe(true);
    });

    it("fails when fewer elements than expected", async () => {
      const page = makePage({ $$: vi.fn().mockResolvedValue([{}]) });
      const result = await executeStep(
        page,
        "expect at least 5 .item",
        "https://example.com"
      );
      expect(result.passed).toBe(false);
      expect(result.error).toMatch(/Expected at least 5/);
    });
  });

  describe("wait", () => {
    it("waits the given number of milliseconds", async () => {
      const page = makePage();
      await executeStep(page, "wait 500", "https://example.com");
      expect(vi.mocked(page.waitForTimeout)).toHaveBeenCalledWith(500);
    });

    it("waits the given ms when unit is explicit", async () => {
      const page = makePage();
      await executeStep(page, "wait 500ms", "https://example.com");
      expect(vi.mocked(page.waitForTimeout)).toHaveBeenCalledWith(500);
    });

    it("converts seconds to milliseconds", async () => {
      const page = makePage();
      await executeStep(page, "wait 3s", "https://example.com");
      expect(vi.mocked(page.waitForTimeout)).toHaveBeenCalledWith(3000);
    });
  });

  describe("verify not", () => {
    it("passes when text is absent", async () => {
      const page = makePage({ $$: vi.fn().mockResolvedValue([]) });
      const result = await executeStep(page, "verify no error message", "https://example.com");
      expect(result.passed).toBe(true);
    });

    it("fails when text is present", async () => {
      const page = makePage({ $$: vi.fn().mockResolvedValue([{}]) });
      const result = await executeStep(page, "verify not Error occurred", "https://example.com");
      expect(result.passed).toBe(false);
      expect(result.error).toMatch(/not be present/);
    });
  });

  describe("unknown step", () => {
    it("returns passed=true for unrecognised steps (skip behaviour)", async () => {
      const page = makePage();
      const result = await executeStep(page, "do something unsupported", "https://example.com");
      expect(result.passed).toBe(true);
      expect(result.durationMs).toBe(0);
    });
  });

  describe("result shape", () => {
    it("includes the original step text in the result", async () => {
      const page = makePage();
      const result = await executeStep(page, "submit", "https://example.com");
      expect(result.step).toBe("submit");
    });

    it("captures a non-Error thrown value as a string", async () => {
      const page = makePage({ click: vi.fn().mockRejectedValue("string error") });
      const result = await executeStep(page, "click button", "https://example.com");
      expect(result.passed).toBe(false);
      expect(result.error).toBe("string error");
    });
  });
});
