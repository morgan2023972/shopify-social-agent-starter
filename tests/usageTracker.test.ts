import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("usageTracker", () => {
  let tempRoot: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();

    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "usage-tracker-"));
    await fs.mkdir(path.join(tempRoot, "data"), { recursive: true });
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempRoot);

    process.env.OPENAI_API_KEY = "test-key";
    process.env.DAILY_BUDGET_USD = "1.0";
    process.env.COST_PER_POST_READ = "0.005";
    process.env.COST_PER_USER_READ = "0.01";
    process.env.COST_PER_POST_CREATE = "0.01";
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("resets usage when stored date is not today", async () => {
    const usageFile = path.join(tempRoot, "data", "usage.json");
    await fs.writeFile(
      usageFile,
      JSON.stringify(
        {
          date: "2000-01-01",
          cost: 0.42,
          calls: { readPost: 10, readUser: 2, createPost: 1 },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const { getUsage } = await import("../src/utils/usageTracker");
    const usage = await getUsage();

    expect(usage.date).toBe(new Date().toISOString().slice(0, 10));
    expect(usage.cost).toBe(0);
    expect(usage.calls.readPost).toBe(0);
    expect(usage.calls.readUser).toBe(0);
    expect(usage.calls.createPost).toBe(0);
  }, 15000);

  it("blocks spending when budget would be exceeded", async () => {
    const usageFile = path.join(tempRoot, "data", "usage.json");
    await fs.writeFile(
      usageFile,
      JSON.stringify(
        {
          date: new Date().toISOString().slice(0, 10),
          cost: 0.995,
          calls: { readPost: 100, readUser: 50, createPost: 0 },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const { canSpend } = await import("../src/utils/usageTracker");
    const allowed = await canSpend(0.01);
    expect(allowed).toBe(false);
  }, 15000);

  it("increments usage cost and counters with addCost", async () => {
    const usageFile = path.join(tempRoot, "data", "usage.json");
    await fs.writeFile(
      usageFile,
      JSON.stringify(
        {
          date: new Date().toISOString().slice(0, 10),
          cost: 0,
          calls: { readPost: 0, readUser: 0, createPost: 0 },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const { addCost, getUsage } = await import("../src/utils/usageTracker");
    await addCost("readUser");

    const usage = await getUsage();
    expect(usage.calls.readUser).toBe(1);
    expect(usage.cost).toBe(0.01);
  }, 15000);

  it("fails closed when usage file is missing", async () => {
    const { getUsage } = await import("../src/utils/usageTracker");
    await expect(getUsage()).rejects.toThrow("Usage tracker unavailable");
  }, 15000);
});
