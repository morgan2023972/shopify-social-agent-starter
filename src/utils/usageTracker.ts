import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config } from "../config";
import type { UsageCallType, UsageStats } from "../types";

let usageLock: Promise<void> = Promise.resolve();

async function withUsageLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = usageLock;
  let release: (() => void) | undefined;
  usageLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    return await fn();
  } finally {
    release?.();
  }
}

const UsageSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cost: z.number().nonnegative(),
  calls: z.object({
    readPost: z.number().int().nonnegative(),
    readUser: z.number().int().nonnegative(),
    createPost: z.number().int().nonnegative(),
  }),
});

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function usageFilePath(): string {
  return path.resolve(process.cwd(), "data", "usage.json");
}

function emptyUsageForToday(): UsageStats {
  return {
    date: todayIsoDate(),
    cost: 0,
    calls: {
      readPost: 0,
      readUser: 0,
      createPost: 0,
    },
  };
}

function costForType(type: UsageCallType): number {
  if (type === "readPost") return config.costPerPostRead;
  if (type === "readUser") return config.costPerUserRead;
  return config.costPerPostCreate;
}

async function writeUsageAtomic(stats: UsageStats): Promise<void> {
  const file = usageFilePath();
  const dir = path.dirname(file);
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const content = `${JSON.stringify(stats, null, 2)}\n`;

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(temp, content, "utf-8");

  try {
    await fs.rename(temp, file);
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => undefined);
    throw new Error(
      `Usage tracker write failed (fail-closed): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function loadUsageStrict(): Promise<UsageStats> {
  const file = usageFilePath();
  let raw: string;

  try {
    raw = await fs.readFile(file, "utf-8");
  } catch (error) {
    throw new Error(
      `Usage tracker unavailable (missing or unreadable usage.json). Run 'npm run usage:reset'. Details: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "Usage tracker data is corrupted (invalid JSON). Run 'npm run usage:reset'.",
    );
  }

  const result = UsageSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      "Usage tracker data is corrupted (invalid schema). Run 'npm run usage:reset'.",
    );
  }

  return result.data;
}

async function loadUsageWithDailyReset(): Promise<UsageStats> {
  const current = await loadUsageStrict();
  const today = todayIsoDate();

  if (current.date === today) {
    return current;
  }

  const reset = emptyUsageForToday();
  await writeUsageAtomic(reset);
  return reset;
}

export async function canSpend(cost: number): Promise<boolean> {
  if (!Number.isFinite(cost) || cost < 0) {
    throw new Error(`Invalid cost estimate: ${cost}`);
  }

  return withUsageLock(async () => {
    const usage = await loadUsageWithDailyReset();
    return usage.cost + cost <= config.dailyBudgetUsd;
  });
}

export async function addCost(type: UsageCallType): Promise<void> {
  await withUsageLock(async () => {
    const usage = await loadUsageWithDailyReset();
    const callCost = costForType(type);
    const next: UsageStats = {
      ...usage,
      cost: Number((usage.cost + callCost).toFixed(6)),
      calls: {
        ...usage.calls,
        [type]: usage.calls[type] + 1,
      },
    };

    await writeUsageAtomic(next);

    const remaining = Number(
      Math.max(0, config.dailyBudgetUsd - next.cost).toFixed(6),
    );
    console.log(
      `[usage] type=${type} cost=${callCost.toFixed(6)} total=${next.cost.toFixed(6)} remaining=${remaining.toFixed(6)}`,
    );
  });
}

export async function getUsage(): Promise<UsageStats> {
  return withUsageLock(() => loadUsageWithDailyReset());
}

export async function resetUsage(): Promise<UsageStats> {
  return withUsageLock(async () => {
    const reset = emptyUsageForToday();
    await writeUsageAtomic(reset);
    return reset;
  });
}
