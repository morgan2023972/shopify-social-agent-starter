import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem } from "../src/types";

const readJsonMock = vi.fn();
const writeJsonMock = vi.fn();

vi.mock("../src/storage/jsonStore", () => ({
  readJson: readJsonMock,
  writeJson: writeJsonMock,
}));

describe("approveQueueItem", () => {
  beforeEach(() => {
    vi.resetModules();
    readJsonMock.mockReset();
    writeJsonMock.mockReset();
  });

  it("approves an item and selects the requested variant text", async () => {
    const item: QueueItem = {
      id: "q_1",
      type: "comment",
      platform: "x",
      targetId: "t1",
      targetHandle: "ShopifyDevs",
      sourcePostId: "p1",
      sourcePostUrl: "https://x.com/shopifydevs/status/1",
      sourcePostText: "Source",
      score: 88,
      reason: "good",
      postLanguage: "en",
      publishLanguage: "en",
      variants: [
        {
          text: "Public variant 1",
          reviewText: "Review variant 1",
          postLanguage: "en",
          publishLanguage: "en",
        },
        {
          text: "Public variant 2",
          reviewText: "Review variant 2",
          postLanguage: "en",
          publishLanguage: "en",
        },
      ],
      selectedText: "Public variant 1",
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    readJsonMock.mockResolvedValue([item]);
    writeJsonMock.mockResolvedValue(undefined);

    const { approveQueueItem } = await import("../src/queue/queueService");
    const approved = await approveQueueItem("q_1", 1);

    expect(approved.status).toBe("approved");
    expect(approved.selectedText).toBe("Public variant 2");
    expect(approved.selectedText).not.toBe("Review variant 2");

    expect(writeJsonMock).toHaveBeenCalledTimes(1);
    const savedQueue = writeJsonMock.mock.calls[0][1] as QueueItem[];
    expect(savedQueue[0].status).toBe("approved");
    expect(savedQueue[0].selectedText).toBe("Public variant 2");

    const maybeWithIndex = approved as QueueItem & {
      selectedVariantIndex?: number;
    };
    if (typeof maybeWithIndex.selectedVariantIndex !== "undefined") {
      expect(maybeWithIndex.selectedVariantIndex).toBe(1);
    }
  });
});
