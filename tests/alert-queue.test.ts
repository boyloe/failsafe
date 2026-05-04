import { describe, it, expect, vi, beforeEach } from "vitest";
import { enqueueAlert, processAlertQueue } from "../runner/alert-queue";
import type { AlertPayload } from "../runner/alerts";

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  runnerLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock the generated Prisma client so tests run without `prisma generate`.
vi.mock("@prisma/client", () => ({
  AlertChannel: { EMAIL: "EMAIL", TELEGRAM: "TELEGRAM", SLACK: "SLACK" },
  AlertQueueStatus: { PENDING: "PENDING", DELIVERED: "DELIVERED", FAILED: "FAILED" },
  PrismaClient: class {},
}));

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));

// vi.hoisted ensures these are defined before the vi.mock factory runs.
const { mockSendEmail, mockSendTelegram, mockSendSlack } = vi.hoisted(() => ({
  mockSendEmail: vi.fn().mockResolvedValue(undefined),
  mockSendTelegram: vi.fn().mockResolvedValue(undefined),
  mockSendSlack: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../runner/alerts", () => ({
  sendEmailAlert: mockSendEmail,
  sendTelegramAlert: mockSendTelegram,
  sendSlackAlert: mockSendSlack,
}));

// Pull enum values from the mock (plain strings) so tests stay in sync with the mock.
const AlertChannel = { EMAIL: "EMAIL", TELEGRAM: "TELEGRAM", SLACK: "SLACK" } as const;
const AlertQueueStatus = {
  PENDING: "PENDING",
  DELIVERED: "DELIVERED",
  FAILED: "FAILED",
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    alertQueue: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

function makePayload(overrides: Partial<AlertPayload> = {}): AlertPayload {
  return {
    clientName: "Acme",
    clientUrl: "https://acme.com",
    flowName: "Checkout",
    status: "FAIL",
    ranAt: new Date("2024-01-15T10:00:00Z"),
    ...overrides,
  };
}

function makeQueueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    channel: AlertChannel.EMAIL,
    destination: "user@example.com",
    payload: makePayload() as object,
    status: AlertQueueStatus.PENDING,
    attempts: 0,
    maxAttempts: 5,
    nextRetryAt: new Date(Date.now() - 1000),
    lastError: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ── enqueueAlert ──────────────────────────────────────────────────────────────

describe("enqueueAlert", () => {
  it("creates a queue entry with PENDING status", async () => {
    const prisma = makePrisma() as any;
    await enqueueAlert(prisma, AlertChannel.EMAIL, "user@example.com", makePayload());
    expect(prisma.alertQueue.create).toHaveBeenCalledOnce();
    const { data } = prisma.alertQueue.create.mock.calls[0][0];
    expect(data.status).toBe(AlertQueueStatus.PENDING);
  });

  it("stores the channel and destination", async () => {
    const prisma = makePrisma() as any;
    await enqueueAlert(prisma, AlertChannel.TELEGRAM, "chat123", makePayload());
    const { data } = prisma.alertQueue.create.mock.calls[0][0];
    expect(data.channel).toBe(AlertChannel.TELEGRAM);
    expect(data.destination).toBe("chat123");
  });

  it("sets nextRetryAt to approximately the current time (immediate first attempt)", async () => {
    const before = Date.now();
    const prisma = makePrisma() as any;
    await enqueueAlert(prisma, AlertChannel.SLACK, "https://hooks.slack.com/x", makePayload());
    const after = Date.now();
    const { data } = prisma.alertQueue.create.mock.calls[0][0];
    expect(data.nextRetryAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(data.nextRetryAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("serialises the full payload into the record", async () => {
    const prisma = makePrisma() as any;
    const payload = makePayload({ flowName: "Login Flow" });
    await enqueueAlert(prisma, AlertChannel.EMAIL, "a@b.com", payload);
    const { data } = prisma.alertQueue.create.mock.calls[0][0];
    expect((data.payload as AlertPayload).flowName).toBe("Login Flow");
  });
});

// ── processAlertQueue ─────────────────────────────────────────────────────────

describe("processAlertQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
    mockSendTelegram.mockResolvedValue(undefined);
    mockSendSlack.mockResolvedValue(undefined);
  });

  it("returns early without DB writes when there are no due items", async () => {
    const prisma = makePrisma() as any;
    prisma.alertQueue.findMany.mockResolvedValue([]);
    await processAlertQueue(prisma);
    expect(prisma.alertQueue.update).not.toHaveBeenCalled();
  });

  it("calls sendEmailAlert for EMAIL channel items", async () => {
    const prisma = makePrisma() as any;
    prisma.alertQueue.findMany.mockResolvedValue([makeQueueItem()]);
    await processAlertQueue(prisma);
    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledWith("user@example.com", expect.any(Object));
  });

  it("calls sendTelegramAlert for TELEGRAM channel items", async () => {
    const prisma = makePrisma() as any;
    prisma.alertQueue.findMany.mockResolvedValue([
      makeQueueItem({ channel: AlertChannel.TELEGRAM, destination: "chat456" }),
    ]);
    await processAlertQueue(prisma);
    expect(mockSendTelegram).toHaveBeenCalledWith("chat456", expect.any(Object));
  });

  it("calls sendSlackAlert for SLACK channel items", async () => {
    const prisma = makePrisma() as any;
    prisma.alertQueue.findMany.mockResolvedValue([
      makeQueueItem({
        channel: AlertChannel.SLACK,
        destination: "https://hooks.slack.com/T1/B2/abc",
      }),
    ]);
    await processAlertQueue(prisma);
    expect(mockSendSlack).toHaveBeenCalledWith(
      "https://hooks.slack.com/T1/B2/abc",
      expect.any(Object)
    );
  });

  it("marks the item DELIVERED on successful send", async () => {
    const prisma = makePrisma() as any;
    prisma.alertQueue.findMany.mockResolvedValue([makeQueueItem()]);
    await processAlertQueue(prisma);
    expect(prisma.alertQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: AlertQueueStatus.DELIVERED }),
      })
    );
  });

  it("rehydrates payload.ranAt as a Date before sending", async () => {
    const prisma = makePrisma() as any;
    const rawPayload = { ...makePayload(), ranAt: "2024-01-15T10:00:00Z" };
    prisma.alertQueue.findMany.mockResolvedValue([makeQueueItem({ payload: rawPayload })]);
    await processAlertQueue(prisma);
    const [, sentPayload] = mockSendEmail.mock.calls[0];
    expect(sentPayload.ranAt).toBeInstanceOf(Date);
  });

  describe("on failure", () => {
    it("increments the attempt count", async () => {
      const prisma = makePrisma() as any;
      mockSendEmail.mockRejectedValue(new Error("network error"));
      prisma.alertQueue.findMany.mockResolvedValue([makeQueueItem({ attempts: 1 })]);
      await processAlertQueue(prisma);
      const { data } = prisma.alertQueue.update.mock.calls[0][0];
      expect(data.attempts).toBe(2);
    });

    it("stores the error message in lastError", async () => {
      const prisma = makePrisma() as any;
      mockSendEmail.mockRejectedValue(new Error("SMTP timeout"));
      prisma.alertQueue.findMany.mockResolvedValue([makeQueueItem()]);
      await processAlertQueue(prisma);
      const { data } = prisma.alertQueue.update.mock.calls[0][0];
      expect(data.lastError).toBe("SMTP timeout");
    });

    it("keeps status PENDING when attempts are not exhausted", async () => {
      const prisma = makePrisma() as any;
      mockSendEmail.mockRejectedValue(new Error("fail"));
      prisma.alertQueue.findMany.mockResolvedValue([makeQueueItem({ attempts: 0, maxAttempts: 5 })]);
      await processAlertQueue(prisma);
      const { data } = prisma.alertQueue.update.mock.calls[0][0];
      expect(data.status).toBe(AlertQueueStatus.PENDING);
    });

    it("marks status FAILED when maxAttempts is exhausted", async () => {
      const prisma = makePrisma() as any;
      mockSendEmail.mockRejectedValue(new Error("fail"));
      prisma.alertQueue.findMany.mockResolvedValue([makeQueueItem({ attempts: 4, maxAttempts: 5 })]);
      await processAlertQueue(prisma);
      const { data } = prisma.alertQueue.update.mock.calls[0][0];
      expect(data.status).toBe(AlertQueueStatus.FAILED);
    });

    it("schedules nextRetryAt in the future on first failure", async () => {
      const before = Date.now();
      const prisma = makePrisma() as any;
      mockSendEmail.mockRejectedValue(new Error("fail"));
      prisma.alertQueue.findMany.mockResolvedValue([makeQueueItem({ attempts: 0, maxAttempts: 5 })]);
      await processAlertQueue(prisma);
      const { data } = prisma.alertQueue.update.mock.calls[0][0];
      // attempt 0→1: BACKOFF_MINUTES[1] = 5 minutes
      expect(data.nextRetryAt.getTime()).toBeGreaterThan(before + 4 * 60 * 1000);
    });

    it("continues processing remaining items after one fails", async () => {
      const prisma = makePrisma() as any;
      mockSendEmail
        .mockRejectedValueOnce(new Error("first failed"))
        .mockResolvedValueOnce(undefined);
      prisma.alertQueue.findMany.mockResolvedValue([
        makeQueueItem({ id: "a" }),
        makeQueueItem({ id: "b" }),
      ]);
      await processAlertQueue(prisma);
      expect(mockSendEmail).toHaveBeenCalledTimes(2);
    });
  });

  describe("backoff schedule", () => {
    // The code calls nextRetryDelay(item.attempts + 1), so BACKOFF_MINUTES is indexed
    // by the NEW attempt count: 0→unused, 1→5m, 2→15m, 3→60m, 4→240m.
    // [currentAttempts, expectedDelayMinutes]
    const cases: [number, number][] = [
      [0, 5],    // nextRetryDelay(1) = BACKOFF_MINUTES[1] = 5 min
      [1, 15],   // nextRetryDelay(2) = BACKOFF_MINUTES[2] = 15 min
      [2, 60],   // nextRetryDelay(3) = BACKOFF_MINUTES[3] = 60 min
      [3, 240],  // nextRetryDelay(4) = BACKOFF_MINUTES[4] = 240 min
    ];

    it.each(cases)(
      "attempt %i → ~%i-minute delay before next retry",
      async (currentAttempts, expectedMinutes) => {
        const prisma = makePrisma() as any;
        mockSendEmail.mockRejectedValue(new Error("fail"));
        prisma.alertQueue.findMany.mockResolvedValue([
          makeQueueItem({ attempts: currentAttempts, maxAttempts: 10 }),
        ]);
        const before = Date.now();
        await processAlertQueue(prisma);
        const { data } = prisma.alertQueue.update.mock.calls[0][0];
        if (data.status === AlertQueueStatus.PENDING) {
          const delayMs = data.nextRetryAt.getTime() - before;
          const expectedMs = expectedMinutes * 60 * 1000;
          expect(delayMs).toBeGreaterThanOrEqual(expectedMs - 100);
          expect(delayMs).toBeLessThanOrEqual(expectedMs + 1000);
        }
      }
    );
  });
});
