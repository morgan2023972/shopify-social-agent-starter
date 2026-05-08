import { config } from "../config";
import { readJson } from "../storage/jsonStore";
import type { Target } from "../types";

export async function dailyEstimateCommand(): Promise<void> {
  const targets = await readJson<Target[]>("targets.json", []);
  const xTargets = targets.filter((target) => target.platform === "x");
  const targetCount = xTargets.length;

  const estimatedReadUserCalls = targetCount;
  const estimatedReadPostCalls = targetCount * config.maxPostsPerAccount;

  const estimatedReadUserCost = Number(
    (estimatedReadUserCalls * config.costPerUserRead).toFixed(6),
  );
  const estimatedReadPostCost = Number(
    (estimatedReadPostCalls * config.costPerPostRead).toFixed(6),
  );
  const estimatedTotalCost = Number(
    (estimatedReadUserCost + estimatedReadPostCost).toFixed(6),
  );
  const estimatedRemaining = Number(
    (config.dailyBudgetUsd - estimatedTotalCost).toFixed(6),
  );

  console.log("Daily run estimate (no API call performed)");
  console.log(`Targets (x): ${targetCount}`);
  console.log(`MAX_POSTS_PER_ACCOUNT: ${config.maxPostsPerAccount}`);
  console.log(`Estimated readUser calls: ${estimatedReadUserCalls}`);
  console.log(`Estimated readPost calls: ${estimatedReadPostCalls}`);
  console.log(`Estimated readUser cost: $${estimatedReadUserCost.toFixed(6)}`);
  console.log(`Estimated readPost cost: $${estimatedReadPostCost.toFixed(6)}`);
  console.log(`Estimated total cost: $${estimatedTotalCost.toFixed(6)}`);
  console.log(`Daily budget: $${config.dailyBudgetUsd.toFixed(6)}`);

  if (estimatedRemaining < 0) {
    console.log(
      `Budget delta: -$${Math.abs(estimatedRemaining).toFixed(6)} (over budget)`,
    );
    return;
  }

  console.log(
    `Budget remaining after estimate: $${estimatedRemaining.toFixed(6)}`,
  );
}
