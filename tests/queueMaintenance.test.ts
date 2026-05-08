import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem } from "../src/types";

const readJsonMock = vi.fn();
const writeJsonMock = vi.fn();

vi.mock("../src/storage/jsonStore", () => ({
  readJson: readJsonMock,
  writeJson: writeJsonMock,
}));

function makeItem(
  id: string,
  status: QueueItem["status"],
  selectedText = "text",
): QueueItem {
  return {
    id,
    type: "comment",
    platform: "x",
    targetId: "t1",
    targetHandle: "ShopifyDevs",
    sourcePostId: `p_${id}`,
    sourcePostUrl: `https://x.com/shopifydevs/status/${id}`,
    sourcePostText: "Source",
    score: 80,
    reason: "ok",
    postLanguage: "en",
    publishLanguage: "en",
    variants: [
      {
        text: "text",
        reviewText: "text",
        postLanguage: "en",
        publishLanguage: "en",
      },
    ],
    selectedText,
    status,
    createdAt: new Date().toISOString(),
  };
}

describe("queue maintenance", () => {
  beforeEach(() => {
    vi.resetModules();
    readJsonMock.mockReset();
    writeJsonMock.mockReset();
  });

  it("rejectQueueItem marks pending item as rejected", async () => {
    const item = makeItem("q_pending", "pending", "selected");
    readJsonMock.mockResolvedValue([item]);
    writeJsonMock.mockResolvedValue(undefined);

    const { rejectQueueItem } = await import("../src/queue/queueService");
    await rejectQueueItem("q_pending");

    expect(writeJsonMock).toHaveBeenCalledTimes(1);
    const saved = writeJsonMock.mock.calls[0][1] as QueueItem[];
    expect(saved[0].status).toBe("rejected");
    expect(saved[0].selectedText).toBeUndefined();
  });

  it("rejectQueueItem fails safely when item does not exist", async () => {
    readJsonMock.mockResolvedValue([]);

    const { rejectQueueItem } = await import("../src/queue/queueService");
    await expect(rejectQueueItem("missing")).rejects.toThrow(
      "Queue item not found",
    );
    expect(writeJsonMock).not.toHaveBeenCalled();
  });

  it("cleanupQueue removes rejected and published items", async () => {
    const queue = [
      makeItem("q1", "rejected"),
      makeItem("q2", "published"),
      makeItem("q3", "pending"),
      makeItem("q4", "approved"),
    ];

    readJsonMock.mockResolvedValue(queue);
    writeJsonMock.mockResolvedValue(undefined);

    const { cleanupQueue } = await import("../src/queue/queueService");
    const result = await cleanupQueue();

    expect(result.removed).toBe(2);
    expect(result.kept).toBe(2);

    const saved = writeJsonMock.mock.calls[0][1] as QueueItem[];
    expect(saved.map((item) => item.status)).toEqual(["pending", "approved"]);
  });

  it("cleanupQueue keeps pending and approved items", async () => {
    const queue = [makeItem("q3", "pending"), makeItem("q4", "approved")];

    readJsonMock.mockResolvedValue(queue);
    writeJsonMock.mockResolvedValue(undefined);

    const { cleanupQueue } = await import("../src/queue/queueService");
    const result = await cleanupQueue();

    expect(result.removed).toBe(0);
    expect(result.kept).toBe(2);

    const saved = writeJsonMock.mock.calls[0][1] as QueueItem[];
    expect(saved).toHaveLength(2);
    expect(saved[0].status).toBe("pending");
    expect(saved[1].status).toBe("approved");
  });
});
