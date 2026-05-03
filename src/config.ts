import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  X_BEARER_TOKEN: z.string().optional().default(''),
  X_APP_KEY: z.string().optional().default(''),
  X_APP_SECRET: z.string().optional().default(''),
  X_ACCESS_TOKEN: z.string().optional().default(''),
  X_ACCESS_SECRET: z.string().optional().default(''),
  DRY_RUN: z.string().optional().default('true'),
  MAX_COMMENTS_PER_DAY: z.coerce.number().int().positive().default(5),
  MIN_SCORE_TO_QUEUE: z.coerce.number().int().min(0).max(100).default(70)
});

export const env = EnvSchema.parse(process.env);

export const config = {
  dryRun: env.DRY_RUN !== 'false',
  maxCommentsPerDay: env.MAX_COMMENTS_PER_DAY,
  minScoreToQueue: env.MIN_SCORE_TO_QUEUE
};
