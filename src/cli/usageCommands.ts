import { config } from "../config";
import { readJson, writeJson } from "../storage/jsonStore";
import { getUsage, resetUsage } from "../utils/usageTracker";

export async function usageShowCommand(): Promise<void> {
  const usage = await getUsage();
  const remaining = Number((config.dailyBudgetUsd - usage.cost).toFixed(6));

  console.log(`date=${usage.date}`);
  console.log(`budget=${config.dailyBudgetUsd}`);
  console.log(`cost=${usage.cost}`);
  console.log(`remaining=${remaining >= 0 ? remaining : 0}`);
  console.log(
    `calls.readPost=${usage.calls.readPost} calls.readUser=${usage.calls.readUser} calls.createPost=${usage.calls.createPost}`,
  );
}

export async function usageResetCommand(): Promise<void> {
  const usage = await resetUsage();
  console.log(`Usage reset for ${usage.date}.`);
}

export async function resetProcessedCommand(): Promise<void> {
  const seen = await readJson<string[]>("seen-posts.json", []);
  const count = seen.length;
  await writeJson("seen-posts.json", []);
  console.log(`Cleared ${count} processed post ID(s) from seen-posts.json.`);
}
