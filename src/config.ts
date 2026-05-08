import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  X_BEARER_TOKEN: z.string().optional().default(""),
  X_APP_KEY: z.string().optional().default(""),
  X_APP_SECRET: z.string().optional().default(""),
  X_ACCESS_TOKEN: z.string().optional().default(""),
  X_ACCESS_SECRET: z.string().optional().default(""),
  DRY_RUN: z.string().optional().default("true"),
  MAX_COMMENTS_PER_DAY: z.coerce.number().int().positive().default(5),
  MIN_SCORE_TO_QUEUE: z.coerce.number().int().min(0).max(100).default(70),
  MAX_POSTS_PER_ACCOUNT: z.coerce.number().int().positive().default(5),
  DAILY_BUDGET_USD: z.coerce.number().positive().default(1.0),
  COST_PER_POST_READ: z.coerce.number().nonnegative().default(0.005),
  COST_PER_USER_READ: z.coerce.number().nonnegative().default(0.01),
  COST_PER_POST_CREATE: z.coerce.number().nonnegative().default(0.01),
  X_USER_CACHE_TTL_DAYS: z.coerce.number().int().positive().default(30),
});

export const env = EnvSchema.parse(process.env);

export const config = {
  dryRun: env.DRY_RUN !== "false",
  maxCommentsPerDay: env.MAX_COMMENTS_PER_DAY,
  minScoreToQueue: env.MIN_SCORE_TO_QUEUE,
  maxPostsPerAccount: env.MAX_POSTS_PER_ACCOUNT,
  dailyBudgetUsd: env.DAILY_BUDGET_USD,
  costPerPostRead: env.COST_PER_POST_READ,
  costPerUserRead: env.COST_PER_USER_READ,
  costPerPostCreate: env.COST_PER_POST_CREATE,
  xUserCacheTtlDays: env.X_USER_CACHE_TTL_DAYS,
};
