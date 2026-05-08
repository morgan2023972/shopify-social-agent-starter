import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LegacyQueueItem } from "../src/types";

const readJsonMock = vi.fn();
const writeJsonMock = vi.fn();

vi.mock("../src/storage/jsonStore", () => ({
  readJson: readJsonMock,
  writeJson: writeJsonMock,
}));

describe("legacy queue normalization", () => {
  beforeEach(() => {
    vi.resetModules();
    readJsonMock.mockReset();
    writeJsonMock.mockReset();
  });

  it("normalizes string variants into structured variants", async () => {
    const legacyItem: LegacyQueueItem = {
      id: "q_legacy",
      type: "comment",
      platform: "x",
      targetId: "t1",
      targetHandle: "ShopifyDevs",
      sourcePostId: "p1",
      sourcePostUrl: "https://x.com/shopifydevs/status/1",
      sourcePostText: "Source",
      score: 80,
      reason: "legacy",
      variants: ["Great Shopify update..."],
      selectedText: "Great Shopify update...",
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    readJsonMock.mockResolvedValue([legacyItem]);

    const { getQueue } = await import("../src/queue/queueService");
    const queue = await getQueue();

    expect(queue).toHaveLength(1);
    expect(queue[0].variants).toHaveLength(1);
    expect(queue[0].variants[0].text).toBe("Great Shopify update...");
    expect(queue[0].variants[0].reviewText).toBe("Great Shopify update...");
    expect(queue[0].variants[0].postLanguage).toBe("en");
    expect(queue[0].variants[0].publishLanguage).toBe("en");
  });
});
