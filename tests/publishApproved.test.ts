import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem } from "../src/types";

describe("publishApproved", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("does not publish when dryRun is enabled", async () => {
    const item: QueueItem = {
      id: "q_1",
      type: "comment",
      platform: "x",
      targetId: "t1",
      targetHandle: "ShopifyDevs",
      sourcePostId: "p1",
      sourcePostUrl: "https://x.com/shopifydevs/status/1",
      sourcePostText: "Source",
      score: 90,
      reason: "good",
      postLanguage: "en",
      publishLanguage: "en",
      variants: [
        {
          text: "Ship it",
          reviewText: "Ship it",
          postLanguage: "en",
          publishLanguage: "en",
        },
      ],
      selectedText: "Ship it",
      status: "approved",
      createdAt: new Date().toISOString(),
    };

    const getQueueMock = vi.fn().mockResolvedValue([item]);
    const saveQueueMock = vi.fn().mockResolvedValue(undefined);
    const publishXReplyMock = vi.fn().mockResolvedValue({ id: "tweet_1" });

    vi.doMock("../src/config", () => ({
      config: { dryRun: true },
    }));
    vi.doMock("../src/queue/queueService", () => ({
      getQueue: getQueueMock,
      saveQueue: saveQueueMock,
    }));
    vi.doMock("../src/platforms/xClient", () => ({
      publishXReply: publishXReplyMock,
    }));

    const { publishApproved } = await import("../src/publish/publishApproved");
    await publishApproved();

    expect(publishXReplyMock).not.toHaveBeenCalled();
    expect(saveQueueMock).not.toHaveBeenCalled();
    expect(item.status).toBe("approved");
    expect(item.publishedAt).toBeUndefined();
  });

  it("publishes and persists when dryRun is disabled", async () => {
    const item: QueueItem = {
      id: "q_2",
      type: "comment",
      platform: "x",
      targetId: "t1",
      targetHandle: "ShopifyDevs",
      sourcePostId: "p2",
      sourcePostUrl: "https://x.com/shopifydevs/status/2",
      sourcePostText: "Source",
      score: 85,
      reason: "good",
      postLanguage: "en",
      publishLanguage: "en",
      variants: [
        {
          text: "Reply",
          reviewText: "Reply",
          postLanguage: "en",
          publishLanguage: "en",
        },
      ],
      selectedText: "Reply",
      status: "approved",
      createdAt: new Date().toISOString(),
    };

    const getQueueMock = vi.fn().mockResolvedValue([item]);
    const saveQueueMock = vi.fn().mockResolvedValue(undefined);
    const publishXReplyMock = vi.fn().mockResolvedValue({ id: "tweet_2" });

    vi.doMock("../src/config", () => ({
      config: { dryRun: false },
    }));
    vi.doMock("../src/queue/queueService", () => ({
      getQueue: getQueueMock,
      saveQueue: saveQueueMock,
    }));
    vi.doMock("../src/platforms/xClient", () => ({
      publishXReply: publishXReplyMock,
    }));

    const { publishApproved } = await import("../src/publish/publishApproved");
    await publishApproved();

    expect(publishXReplyMock).toHaveBeenCalledTimes(1);
    expect(saveQueueMock).toHaveBeenCalledTimes(1);
    expect(item.status).toBe("published");
    expect(item.publishedAt).toBeTypeOf("string");
  });

  it("publishes selectedText and never reviewText", async () => {
    const item: QueueItem = {
      id: "q_2b",
      type: "comment",
      platform: "x",
      targetId: "t1",
      targetHandle: "ShopifyDevs",
      sourcePostId: "p2b",
      sourcePostUrl: "https://x.com/shopifydevs/status/22",
      sourcePostText: "Source",
      score: 88,
      reason: "good",
      postLanguage: "en",
      publishLanguage: "en",
      reviewLanguage: "fr",
      variants: [
        {
          text: "Public answer",
          reviewText: "Brouillon interne FR",
          postLanguage: "en",
          publishLanguage: "en",
          reviewLanguage: "fr",
        },
      ],
      selectedText: "Public answer",
      status: "approved",
      createdAt: new Date().toISOString(),
    };

    const getQueueMock = vi.fn().mockResolvedValue([item]);
    const saveQueueMock = vi.fn().mockResolvedValue(undefined);
    const publishXReplyMock = vi.fn().mockResolvedValue({ id: "tweet_2b" });

    vi.doMock("../src/config", () => ({
      config: { dryRun: false },
    }));
    vi.doMock("../src/queue/queueService", () => ({
      getQueue: getQueueMock,
      saveQueue: saveQueueMock,
    }));
    vi.doMock("../src/platforms/xClient", () => ({
      publishXReply: publishXReplyMock,
    }));

    const { publishApproved } = await import("../src/publish/publishApproved");
    await publishApproved();

    expect(publishXReplyMock).toHaveBeenCalledTimes(1);
    expect(publishXReplyMock).toHaveBeenCalledWith(
      "Public answer",
      item.sourcePostId,
    );
    expect(publishXReplyMock).not.toHaveBeenCalledWith(
      "Brouillon interne FR",
      item.sourcePostId,
    );
  });

  it("marks item as failed when publish call throws", async () => {
    const item: QueueItem = {
      id: "q_3",
      type: "comment",
      platform: "x",
      targetId: "t1",
      targetHandle: "ShopifyDevs",
      sourcePostId: "p3",
      sourcePostUrl: "https://x.com/shopifydevs/status/3",
      sourcePostText: "Source",
      score: 82,
      reason: "good",
      postLanguage: "en",
      publishLanguage: "en",
      variants: [
        {
          text: "Reply",
          reviewText: "Reply",
          postLanguage: "en",
          publishLanguage: "en",
        },
      ],
      selectedText: "Reply",
      status: "approved",
      createdAt: new Date().toISOString(),
    };

    const getQueueMock = vi.fn().mockResolvedValue([item]);
    const saveQueueMock = vi.fn().mockResolvedValue(undefined);
    const publishXReplyMock = vi.fn().mockRejectedValue(new Error("boom"));

    vi.doMock("../src/config", () => ({
      config: { dryRun: false },
    }));
    vi.doMock("../src/queue/queueService", () => ({
      getQueue: getQueueMock,
      saveQueue: saveQueueMock,
    }));
    vi.doMock("../src/platforms/xClient", () => ({
      publishXReply: publishXReplyMock,
    }));

    const { publishApproved } = await import("../src/publish/publishApproved");
    await publishApproved();

    expect(publishXReplyMock).toHaveBeenCalledTimes(1);
    expect(item.status).toBe("failed");
    expect(item.status).not.toBe("published");
    expect(saveQueueMock).toHaveBeenCalledTimes(1);
  });
});
