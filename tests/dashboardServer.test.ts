import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem } from "../src/types";

type TestServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

const originalCwd = process.cwd;

function makeQueueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
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
    ...overrides,
  };
}

async function startTestServer(queue: QueueItem[]): Promise<TestServer> {
  vi.resetModules();

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dashboard-api-"));
  await fs.mkdir(path.join(tempRoot, "data"), { recursive: true });
  await fs.writeFile(
    path.join(tempRoot, "data", "queue.json"),
    JSON.stringify(queue, null, 2),
    "utf-8",
  );

  const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempRoot);
  const { startDashboardServer } = await import("../src/dashboard/server");
  const server = await startDashboardServer(0);
  const address = server.address();

  if (!address || typeof address === "string") {
    cwdSpy.mockRestore();
    await fs.rm(tempRoot, { recursive: true, force: true });
    throw new Error("Failed to start test server");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: async () => {
      cwdSpy.mockRestore();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      await fs.rm(tempRoot, { recursive: true, force: true });
    },
  };
}

describe.sequential("dashboard server", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.cwd = originalCwd;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.cwd = originalCwd;
  });

  it("returns only pending items with meta count", async () => {
    const server = await startTestServer([
      makeQueueItem({ id: "q_pending", status: "pending" }),
      makeQueueItem({
        id: "q_done",
        status: "approved",
        selectedText: "Public variant 2",
      }),
    ]);

    try {
      const response = await fetch(`${server.baseUrl}/api/queue`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );

      const body = (await response.json()) as {
        data: QueueItem[];
        meta: { count: number };
      };
      expect(body).toEqual({
        data: [
          expect.objectContaining({
            id: "q_pending",
            status: "pending",
          }),
        ],
        meta: {
          count: 1,
        },
      });
      expect(body.meta.count).toBe(body.data.length);
    } finally {
      await server.close();
    }
  });

  it("approves an item and keeps reviewText out of selectedText", async () => {
    const server = await startTestServer([makeQueueItem()]);

    try {
      const response = await fetch(`${server.baseUrl}/api/queue/q_1/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ variantIndex: 1 }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: QueueItem & { selectedVariantIndex?: number };
      };

      expect(body.data.status).toBe("approved");
      expect(body.data.selectedVariantIndex).toBe(1);
      expect(body.data.selectedText).toBe("Public variant 2");
      expect(body.data.selectedText).not.toBe("Review variant 2");

      const savedQueue = JSON.parse(
        await fs.readFile(
          path.join(process.cwd(), "data", "queue.json"),
          "utf-8",
        ),
      ) as Array<QueueItem & { selectedVariantIndex?: number }>;
      expect(savedQueue[0].selectedVariantIndex).toBe(1);
      expect(savedQueue[0].selectedText).toBe("Public variant 2");
    } finally {
      await server.close();
    }
  });

  it("rejects an item and returns a data envelope", async () => {
    const server = await startTestServer([makeQueueItem()]);

    try {
      const response = await fetch(`${server.baseUrl}/api/queue/q_1/reject`, {
        method: "POST",
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: QueueItem };
      expect(body.data.status).toBe("rejected");
      expect(body.data.selectedText).toBeUndefined();
    } finally {
      await server.close();
    }
  });

  it("returns a not found error for unknown queue items", async () => {
    const server = await startTestServer([makeQueueItem()]);

    try {
      const response = await fetch(
        `${server.baseUrl}/api/queue/missing/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ variantIndex: 0 }),
        },
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: "Queue item not found",
      });
    } finally {
      await server.close();
    }
  });

  it("returns a bad request error for invalid variant indexes", async () => {
    const server = await startTestServer([makeQueueItem()]);

    try {
      const response = await fetch(`${server.baseUrl}/api/queue/q_1/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ variantIndex: 99 }),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Invalid variantIndex",
      });
    } finally {
      await server.close();
    }
  });

  it("returns a bad request error for invalid JSON bodies", async () => {
    const server = await startTestServer([makeQueueItem()]);

    try {
      const response = await fetch(`${server.baseUrl}/api/queue/q_1/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{",
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Invalid JSON body",
      });
    } finally {
      await server.close();
    }
  });
});
