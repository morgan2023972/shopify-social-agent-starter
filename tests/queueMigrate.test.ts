import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LegacyQueueItem, QueueItem } from "../src/types";

const readJsonMock = vi.fn();
const getQueueMock = vi.fn();
const saveQueueMock = vi.fn();

vi.mock("../src/storage/jsonStore", () => ({
  readJson: readJsonMock,
}));

vi.mock("../src/queue/queueService", () => ({
  getQueue: getQueueMock,
  saveQueue: saveQueueMock,
}));

describe("queue:migrate", () => {
  beforeEach(() => {
    vi.resetModules();
    readJsonMock.mockReset();
    getQueueMock.mockReset();
    saveQueueMock.mockReset();
  });

  it("is dry-run by default", async () => {
    const legacy: LegacyQueueItem = {
      id: "q_legacy",
      type: "comment",
      platform: "x",
      targetId: "t1",
      targetHandle: "ShopifyDevs",
      sourcePostId: "p1",
      sourcePostUrl: "https://x.com/shopifydevs/status/1",
      sourcePostText: "Source",
      score: 77,
      reason: "legacy",
      variants: ["legacy variant"],
      selectedText: "legacy variant",
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    const normalized: QueueItem = {
      ...legacy,
      postLanguage: "en",
      publishLanguage: "en",
      variants: [
        {
          text: "legacy variant",
          reviewText: "legacy variant",
          postLanguage: "en",
          publishLanguage: "en",
        },
      ],
    };

    readJsonMock.mockResolvedValue([legacy]);
    getQueueMock.mockResolvedValue([normalized]);

    const { migrateQueueCommand } = await import("../src/cli/migrateQueue");
    const result = await migrateQueueCommand();

    expect(result.changed).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.migratedItems).toBe(1);
    expect(saveQueueMock).not.toHaveBeenCalled();
  });

  it("applies changes only with --apply behavior", async () => {
    const legacy: LegacyQueueItem = {
      id: "q_legacy",
      type: "comment",
      platform: "x",
      targetId: "t1",
      targetHandle: "ShopifyDevs",
      sourcePostId: "p1",
      sourcePostUrl: "https://x.com/shopifydevs/status/1",
      sourcePostText: "Source",
      score: 77,
      reason: "legacy",
      variants: ["legacy variant"],
      selectedText: "legacy variant",
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    const normalized: QueueItem = {
      ...legacy,
      postLanguage: "en",
      publishLanguage: "en",
      variants: [
        {
          text: "legacy variant",
          reviewText: "legacy variant",
          postLanguage: "en",
          publishLanguage: "en",
        },
      ],
    };

    readJsonMock.mockResolvedValue([legacy]);
    getQueueMock.mockResolvedValue([normalized]);
    saveQueueMock.mockResolvedValue(undefined);

    const { migrateQueueCommand } = await import("../src/cli/migrateQueue");
    const result = await migrateQueueCommand({ apply: true });

    expect(result.changed).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(saveQueueMock).toHaveBeenCalledTimes(1);
    expect(saveQueueMock).toHaveBeenCalledWith([normalized]);
  });

  it("is idempotent when queue is already normalized", async () => {
    const normalized: QueueItem = {
      id: "q_new",
      type: "comment",
      platform: "x",
      targetId: "t1",
      targetHandle: "ShopifyDevs",
      sourcePostId: "p1",
      sourcePostUrl: "https://x.com/shopifydevs/status/1",
      sourcePostText: "Source",
      score: 88,
      reason: "ok",
      postLanguage: "en",
      publishLanguage: "en",
      variants: [
        {
          text: "v1",
          reviewText: "r1",
          postLanguage: "en",
          publishLanguage: "en",
        },
      ],
      selectedText: "v1",
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    readJsonMock.mockResolvedValue([normalized]);
    getQueueMock.mockResolvedValue([normalized]);

    const { migrateQueueCommand } = await import("../src/cli/migrateQueue");
    const result = await migrateQueueCommand({ apply: true });

    expect(result.changed).toBe(false);
    expect(result.migratedItems).toBe(0);
    expect(saveQueueMock).not.toHaveBeenCalled();
  });
});
