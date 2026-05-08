import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const userByUsernameMock = vi.fn();
const userTimelineMock = vi.fn();
const tweetMock = vi.fn();
const canSpendMock = vi.fn().mockResolvedValue(true);
const addCostMock = vi.fn().mockResolvedValue(undefined);

vi.mock("twitter-api-v2", () => {
  class TwitterApi {
    readOnly = {
      v2: {
        userByUsername: userByUsernameMock,
        userTimeline: userTimelineMock,
      },
    };

    v2 = {
      tweet: tweetMock,
    };

    constructor(_input: unknown) {}
  }

  return { TwitterApi };
});

vi.mock("../src/utils/usageTracker", () => ({
  canSpend: canSpendMock,
  addCost: addCostMock,
}));

describe.sequential("x userId cache", () => {
  let tempRoot: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    userByUsernameMock.mockReset();
    userTimelineMock.mockReset();
    tweetMock.mockReset();
    canSpendMock.mockReset();
    addCostMock.mockReset();

    canSpendMock.mockResolvedValue(true);
    addCostMock.mockResolvedValue(undefined);

    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "x-user-cache-"));
    await fs.mkdir(path.join(tempRoot, "data"), { recursive: true });
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempRoot);

    process.env.OPENAI_API_KEY = "test-key";
    process.env.X_BEARER_TOKEN = "bearer-token";
    process.env.X_USER_CACHE_TTL_DAYS = "30";
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("cache hit avoids API lookup", async () => {
    await fs.writeFile(
      path.join(tempRoot, "data", "x-user-cache.json"),
      JSON.stringify(
        {
          ShopifyDevs: {
            userId: "123456",
            handle: "ShopifyDevs",
            cachedAt: new Date().toISOString(),
            lastVerifiedAt: new Date().toISOString(),
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const { getUserIdByHandle } = await import("../src/platforms/xClient");
    const userId = await getUserIdByHandle("ShopifyDevs");

    expect(userId).toBe("123456");
    expect(userByUsernameMock).not.toHaveBeenCalled();
    expect(canSpendMock).not.toHaveBeenCalled();
    expect(addCostMock).not.toHaveBeenCalled();
  }, 15000);

  it("cache miss calls API and writes cache", async () => {
    userByUsernameMock.mockResolvedValue({ data: { id: "999" } });

    const { getUserIdByHandle } = await import("../src/platforms/xClient");
    const userId = await getUserIdByHandle("ShopifyDevs");

    expect(userId).toBe("999");
    expect(userByUsernameMock).toHaveBeenCalledTimes(1);
    expect(canSpendMock).toHaveBeenCalledTimes(1);
    expect(addCostMock).toHaveBeenCalledWith("readUser");

    const cacheRaw = await fs.readFile(
      path.join(tempRoot, "data", "x-user-cache.json"),
      "utf-8",
    );
    const cache = JSON.parse(cacheRaw) as Record<string, { userId: string }>;
    expect(cache.ShopifyDevs.userId).toBe("999");
    expect(
      typeof (cache.ShopifyDevs as { lastVerifiedAt?: unknown }).lastVerifiedAt,
    ).toBe("string");
  }, 15000);

  it("expired cache refreshes userId", async () => {
    const expired = new Date(
      Date.now() - 40 * 24 * 60 * 60 * 1000,
    ).toISOString();

    await fs.writeFile(
      path.join(tempRoot, "data", "x-user-cache.json"),
      JSON.stringify(
        {
          ShopifyDevs: {
            userId: "old-id",
            handle: "ShopifyDevs",
            cachedAt: expired,
            lastVerifiedAt: expired,
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    userByUsernameMock.mockResolvedValue({ data: { id: "new-id" } });

    const { getUserIdByHandle } = await import("../src/platforms/xClient");
    const userId = await getUserIdByHandle("ShopifyDevs");

    expect(userId).toBe("new-id");
    expect(userByUsernameMock).toHaveBeenCalledTimes(1);

    const cacheRaw = await fs.readFile(
      path.join(tempRoot, "data", "x-user-cache.json"),
      "utf-8",
    );
    const cache = JSON.parse(cacheRaw) as Record<string, { userId: string }>;
    expect(cache.ShopifyDevs.userId).toBe("new-id");
  }, 15000);

  it("invalid cached userId triggers purge and one retry, then refreshes cache", async () => {
    const now = new Date().toISOString();
    await fs.writeFile(
      path.join(tempRoot, "data", "x-user-cache.json"),
      JSON.stringify(
        {
          ShopifyDevs: {
            userId: "stale-id",
            handle: "ShopifyDevs",
            cachedAt: now,
            lastVerifiedAt: now,
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    userTimelineMock
      .mockRejectedValueOnce(new Error("User not found"))
      .mockResolvedValueOnce({ tweets: [] });
    userByUsernameMock.mockResolvedValue({ data: { id: "fresh-id" } });

    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const { fetchRecentUserPosts } = await import("../src/platforms/xClient");
    const posts = await fetchRecentUserPosts("ShopifyDevs", 5);

    expect(posts).toEqual([]);
    expect(userTimelineMock).toHaveBeenCalledTimes(2);
    expect(userByUsernameMock).toHaveBeenCalledTimes(1);
    expect(canSpendMock).toHaveBeenCalledTimes(2);
    expect(addCostMock).toHaveBeenCalledWith("readUser");
    expect(warnSpy).toHaveBeenCalledTimes(2);

    const cacheRaw = await fs.readFile(
      path.join(tempRoot, "data", "x-user-cache.json"),
      "utf-8",
    );
    const cache = JSON.parse(cacheRaw) as Record<string, { userId: string }>;
    expect(cache.ShopifyDevs.userId).toBe("fresh-id");

    warnSpy.mockRestore();
  }, 15000);

  it("retry failure throws and does not loop infinitely", async () => {
    const now = new Date().toISOString();
    await fs.writeFile(
      path.join(tempRoot, "data", "x-user-cache.json"),
      JSON.stringify(
        {
          ShopifyDevs: {
            userId: "stale-id",
            handle: "ShopifyDevs",
            cachedAt: now,
            lastVerifiedAt: now,
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    userTimelineMock.mockRejectedValueOnce(new Error("User not found"));
    userByUsernameMock.mockRejectedValueOnce(new Error("User not found"));

    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const { fetchRecentUserPosts } = await import("../src/platforms/xClient");

    await expect(fetchRecentUserPosts("ShopifyDevs", 5)).rejects.toThrow(
      "User not found",
    );

    expect(userTimelineMock).toHaveBeenCalledTimes(1);
    expect(userByUsernameMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    const cacheRaw = await fs.readFile(
      path.join(tempRoot, "data", "x-user-cache.json"),
      "utf-8",
    );
    const cache = JSON.parse(cacheRaw) as Record<string, unknown>;
    expect(cache.ShopifyDevs).toBeUndefined();

    warnSpy.mockRestore();
  }, 15000);

  it("fails closed on corrupted cache", async () => {
    await fs.writeFile(
      path.join(tempRoot, "data", "x-user-cache.json"),
      "{not-json}",
      "utf-8",
    );

    const { getUserIdByHandle } = await import("../src/platforms/xClient");

    await expect(getUserIdByHandle("ShopifyDevs")).rejects.toThrow(
      "X user cache is corrupted",
    );
    expect(userByUsernameMock).not.toHaveBeenCalled();
  }, 15000);
});
