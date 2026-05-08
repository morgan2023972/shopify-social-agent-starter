import { config } from "../config";
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
