import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendEmailAlert, sendTelegramAlert, sendSlackAlert } from "../runner/alerts";
import type { AlertPayload } from "../runner/alerts";

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  runnerLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Resend mock ───────────────────────────────────────────────────────────────
// vi.hoisted ensures mockEmailSend is defined before the vi.mock factory runs.

const mockEmailSend = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  // Use a class so `new Resend()` works correctly.
  Resend: class {
    emails = { send: mockEmailSend };
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<AlertPayload> = {}): AlertPayload {
  return {
    clientName: "Acme Store",
    clientUrl: "https://acme.com",
    flowName: "Checkout Flow",
    status: "FAIL",
    ranAt: new Date("2024-01-15T10:00:00Z"),
    ...overrides,
  };
}

// ── sendEmailAlert ────────────────────────────────────────────────────────────

describe("sendEmailAlert", () => {
  beforeEach(() => {
    mockEmailSend.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    mockEmailSend.mockReset();
  });

  it("skips sending when RESEND_API_KEY is not set", async () => {
    delete process.env.RESEND_API_KEY;
    await sendEmailAlert("user@example.com", makePayload());
    expect(mockEmailSend).not.toHaveBeenCalled();
  });

  it("sends email when RESEND_API_KEY is set", async () => {
    process.env.RESEND_API_KEY = "test-key";
    await sendEmailAlert("user@example.com", makePayload());
    expect(mockEmailSend).toHaveBeenCalledOnce();
  });

  it("uses FAIL subject line for FAIL status", async () => {
    process.env.RESEND_API_KEY = "test-key";
    await sendEmailAlert("user@example.com", makePayload({ status: "FAIL" }));
    const call = mockEmailSend.mock.calls[0][0];
    expect(call.subject).toMatch(/ALERT/);
    expect(call.subject).toMatch(/Checkout Flow/);
  });

  it("uses RECOVERED subject line for RECOVERED status", async () => {
    process.env.RESEND_API_KEY = "test-key";
    await sendEmailAlert("user@example.com", makePayload({ status: "RECOVERED" }));
    const call = mockEmailSend.mock.calls[0][0];
    expect(call.subject).toMatch(/RECOVERED/);
    expect(call.subject).toMatch(/Checkout Flow/);
  });

  it("includes the error in the HTML body when provided", async () => {
    process.env.RESEND_API_KEY = "test-key";
    await sendEmailAlert("user@example.com", makePayload({ error: "Element not found" }));
    const call = mockEmailSend.mock.calls[0][0];
    expect(call.html).toContain("Element not found");
  });

  it("does not include an error block when error is absent", async () => {
    process.env.RESEND_API_KEY = "test-key";
    await sendEmailAlert("user@example.com", makePayload({ error: undefined }));
    const call = mockEmailSend.mock.calls[0][0];
    // #1a0000 is the background colour exclusive to the error code block
    expect(call.html).not.toContain("#1a0000");
  });

  it("sends to the provided email address", async () => {
    process.env.RESEND_API_KEY = "test-key";
    await sendEmailAlert("recipient@example.com", makePayload());
    const call = mockEmailSend.mock.calls[0][0];
    expect(call.to).toBe("recipient@example.com");
  });

  it("uses EMAIL_FROM env var when set", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "Custom <custom@myapp.com>";
    await sendEmailAlert("user@example.com", makePayload());
    const call = mockEmailSend.mock.calls[0][0];
    expect(call.from).toBe("Custom <custom@myapp.com>");
  });

  it("falls back to the default from address when EMAIL_FROM is not set", async () => {
    process.env.RESEND_API_KEY = "test-key";
    delete process.env.EMAIL_FROM;
    await sendEmailAlert("user@example.com", makePayload());
    const call = mockEmailSend.mock.calls[0][0];
    expect(call.from).toContain("onboarding@resend.dev");
  });

  it("throws when Resend returns an error object", async () => {
    process.env.RESEND_API_KEY = "test-key";
    mockEmailSend.mockResolvedValue({ error: { message: "rate limited" } });
    await expect(sendEmailAlert("user@example.com", makePayload())).rejects.toThrow(
      "rate limited"
    );
  });
});

// ── sendTelegramAlert ─────────────────────────────────────────────────────────

describe("sendTelegramAlert", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({ ok: true, text: async () => "" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TELEGRAM_BOT_TOKEN;
    mockFetch.mockReset();
  });

  it("skips when TELEGRAM_BOT_TOKEN is not set", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    await sendTelegramAlert("123456", makePayload());
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("posts to the correct Telegram API URL", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token-123";
    await sendTelegramAlert("123456", makePayload());
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("bot-token-123/sendMessage");
  });

  it("sends the chat_id in the request body", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "tok";
    await sendTelegramAlert("chat999", makePayload());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.chat_id).toBe("chat999");
  });

  it("includes FAILING label in the message for FAIL status", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "tok";
    await sendTelegramAlert("1", makePayload({ status: "FAIL" }));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).toContain("FAILING");
  });

  it("includes RECOVERED label in the message for RECOVERED status", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "tok";
    await sendTelegramAlert("1", makePayload({ status: "RECOVERED" }));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).toContain("RECOVERED");
  });

  it("includes error text when provided", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "tok";
    await sendTelegramAlert("1", makePayload({ error: "Something went wrong" }));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).toContain("Something went wrong");
  });

  it("does not throw on a non-ok Telegram response", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "tok";
    mockFetch.mockResolvedValue({ ok: false, text: async () => "bad request" });
    await expect(sendTelegramAlert("1", makePayload())).resolves.not.toThrow();
  });
});

// ── sendSlackAlert ────────────────────────────────────────────────────────────

describe("sendSlackAlert", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({ ok: true, text: async () => "" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it("posts to the provided webhook URL", async () => {
    await sendSlackAlert("https://hooks.slack.com/T123/B456/xyz", makePayload());
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/T123/B456/xyz");
  });

  it("uses red colour for FAIL status", async () => {
    await sendSlackAlert("https://hooks.slack.com/webhook", makePayload({ status: "FAIL" }));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.attachments[0].color).toBe("#ef4444");
  });

  it("uses green colour for RECOVERED status", async () => {
    await sendSlackAlert(
      "https://hooks.slack.com/webhook",
      makePayload({ status: "RECOVERED" })
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.attachments[0].color).toBe("#22c55e");
  });

  it("includes an error code block when error is provided", async () => {
    await sendSlackAlert(
      "https://hooks.slack.com/webhook",
      makePayload({ error: "Step timed out" })
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const allText = body.attachments[0].blocks
      .flatMap((b: { text?: { text?: string }; elements?: Array<{ text?: string }> }) =>
        b.text ? [b.text.text] : (b.elements ?? []).map((e) => e.text)
      )
      .filter(Boolean)
      .join(" ");
    expect(allText).toContain("Step timed out");
  });

  it("omits the error block when no error is provided", async () => {
    await sendSlackAlert(
      "https://hooks.slack.com/webhook",
      makePayload({ error: undefined })
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.attachments[0].blocks).toHaveLength(2); // section + context only
  });

  it("does not throw on a non-ok Slack response", async () => {
    mockFetch.mockResolvedValue({ ok: false, text: async () => "invalid_token" });
    await expect(
      sendSlackAlert("https://hooks.slack.com/webhook", makePayload())
    ).resolves.not.toThrow();
  });
});
