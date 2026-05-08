import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const userByUsernameMock = vi.fn();
const userTimelineMock = vi.fn();
const tweetMock = vi.fn();
const canSpendMock = vi.fn();
const addCostMock = vi.fn();
const events: string[] = [];

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

describe.sequential("xClient budget ordering", () => {
  let tempRoot: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    events.length = 0;
    userByUsernameMock.mockReset();
    userTimelineMock.mockReset();
    tweetMock.mockReset();
    canSpendMock.mockReset();
    addCostMock.mockReset();

    canSpendMock.mockImplementation(async () => {
      events.push("canSpend");
      return true;
    });
    addCostMock.mockImplementation(async (type: string) => {
      events.push(`addCost:${type}`);
    });
    userByUsernameMock.mockImplementation(async () => {
      events.push("api:userByUsername");
      return { data: { id: "user-1" } };
    });
    userTimelineMock.mockImplementation(async () => {
      events.push("api:userTimeline");
      return {
        tweets: [
          {
            id: "p1",
            text: "Hello",
            created_at: "2026-05-08T00:00:00.000Z",
            public_metrics: {},
          },
        ],
      };
    });
    tweetMock.mockImplementation(async () => {
      events.push("api:tweet");
      return { data: { id: "tweet-1" } };
    });

    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "xclient-budget-"));
    await fs.mkdir(path.join(tempRoot, "data"), { recursive: true });
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempRoot);

    process.env.OPENAI_API_KEY = "test-key";
    process.env.X_BEARER_TOKEN = "bearer-token";
    process.env.X_APP_KEY = "app-key";
    process.env.X_APP_SECRET = "app-secret";
    process.env.X_ACCESS_TOKEN = "access-token";
    process.env.X_ACCESS_SECRET = "access-secret";
    process.env.X_USER_CACHE_TTL_DAYS = "30";
    process.env.COST_PER_USER_READ = "0.01";
    process.env.COST_PER_POST_READ = "0.005";
    process.env.COST_PER_POST_CREATE = "0.01";
    process.env.DAILY_BUDGET_USD = "1.0";
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("readUser calls canSpend before API and addCost after success", async () => {
    const { getUserIdByHandle } = await import("../src/platforms/xClient");
    await getUserIdByHandle("ShopifyDevs");

    expect(events).toEqual([
      "canSpend",
      "api:userByUsername",
      "addCost:readUser",
    ]);
  }, 15000);

  it("readUser does not call API when canSpend fails", async () => {
    canSpendMock.mockImplementationOnce(async () => {
      events.push("canSpend");
      return false;
    });

    const { getUserIdByHandle } = await import("../src/platforms/xClient");
    await expect(getUserIdByHandle("ShopifyDevs")).rejects.toThrow(
      "Daily budget exceeded",
    );

    expect(events).toEqual(["canSpend"]);
    expect(userByUsernameMock).not.toHaveBeenCalled();
    expect(addCostMock).not.toHaveBeenCalled();
  }, 15000);

  it("readUser does not call addCost when API fails", async () => {
    userByUsernameMock.mockImplementationOnce(async () => {
      events.push("api:userByUsername");
      throw new Error("lookup failed");
    });

    const { getUserIdByHandle } = await import("../src/platforms/xClient");
    await expect(getUserIdByHandle("ShopifyDevs")).rejects.toThrow(
      "lookup failed",
    );

    expect(events).toEqual(["canSpend", "api:userByUsername"]);
    expect(addCostMock).not.toHaveBeenCalled();
  }, 15000);

  it("readPost path calls canSpend before timeline API and addCost after success", async () => {
    await fs.writeFile(
      path.join(tempRoot, "data", "x-user-cache.json"),
      JSON.stringify(
        {
          ShopifyDevs: {
            userId: "cached-user",
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

    const { fetchRecentUserPosts } = await import("../src/platforms/xClient");
    await fetchRecentUserPosts("ShopifyDevs", 5);

    expect(events[0]).toBe("canSpend");
    expect(events[1]).toBe("api:userTimeline");
    expect(events).toContain("addCost:readPost");
    expect(events.indexOf("addCost:readPost")).toBeGreaterThan(
      events.indexOf("api:userTimeline"),
    );
  }, 15000);

  it("readPost does not call timeline API when canSpend fails", async () => {
    await fs.writeFile(
      path.join(tempRoot, "data", "x-user-cache.json"),
      JSON.stringify(
        {
          ShopifyDevs: {
            userId: "cached-user",
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

    canSpendMock.mockImplementationOnce(async () => {
      events.push("canSpend");
      return false;
    });

    const { fetchRecentUserPosts } = await import("../src/platforms/xClient");
    await expect(fetchRecentUserPosts("ShopifyDevs", 5)).rejects.toThrow(
      "Daily budget exceeded",
    );

    expect(events).toEqual(["canSpend"]);
    expect(userTimelineMock).not.toHaveBeenCalled();
    expect(addCostMock).not.toHaveBeenCalled();
  }, 15000);

  it("readPost does not call addCost when timeline API fails", async () => {
    await fs.writeFile(
      path.join(tempRoot, "data", "x-user-cache.json"),
      JSON.stringify(
        {
          ShopifyDevs: {
            userId: "cached-user",
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

    userTimelineMock.mockImplementationOnce(async () => {
      events.push("api:userTimeline");
      throw new Error("timeline failed");
    });

    const { fetchRecentUserPosts } = await import("../src/platforms/xClient");
    await expect(fetchRecentUserPosts("ShopifyDevs", 5)).rejects.toThrow(
      "timeline failed",
    );

    expect(events).toEqual(["canSpend", "api:userTimeline"]);
    expect(addCostMock).not.toHaveBeenCalled();
  }, 15000);

  it("createPost calls canSpend before API and addCost after success", async () => {
    const { publishXReply } = await import("../src/platforms/xClient");
    await publishXReply("Hello", "post-1");

    expect(events).toEqual(["canSpend", "api:tweet", "addCost:createPost"]);
  }, 15000);

  it("createPost does not call API when canSpend fails", async () => {
    canSpendMock.mockImplementationOnce(async () => {
      events.push("canSpend");
      return false;
    });

    const { publishXReply } = await import("../src/platforms/xClient");
    await expect(publishXReply("Hello", "post-1")).rejects.toThrow(
      "Daily budget exceeded",
    );

    expect(events).toEqual(["canSpend"]);
    expect(tweetMock).not.toHaveBeenCalled();
    expect(addCostMock).not.toHaveBeenCalled();
  }, 15000);

  it("createPost does not call addCost when API fails", async () => {
    tweetMock.mockImplementationOnce(async () => {
      events.push("api:tweet");
      throw new Error("tweet failed");
    });

    const { publishXReply } = await import("../src/platforms/xClient");
    await expect(publishXReply("Hello", "post-1")).rejects.toThrow(
      "tweet failed",
    );

    expect(events).toEqual(["canSpend", "api:tweet"]);
    expect(addCostMock).not.toHaveBeenCalled();
  }, 15000);
});
