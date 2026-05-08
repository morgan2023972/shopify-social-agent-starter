import fs from "node:fs/promises";
import path from "node:path";
import { TwitterApi } from "twitter-api-v2";
import { env } from "../config";
import type { SocialPost } from "../types";
import { addCost, canSpend } from "../utils/usageTracker";

type XUserCacheEntry = {
  userId: string;
  handle: string;
  cachedAt: string;
  lastVerifiedAt: string;
};

type XUserCache = Record<string, XUserCacheEntry>;

let xUserCacheLock: Promise<void> = Promise.resolve();

async function withXUserCacheLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = xUserCacheLock;
  let release: (() => void) | undefined;
  xUserCacheLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await fn();
  } finally {
    release?.();
  }
}

function xUserCacheFilePath(): string {
  return path.resolve(process.cwd(), "data", "x-user-cache.json");
}

function normalizeHandle(handle: string): string {
  return handle.replace("@", "").trim();
}

function isValidCacheEntry(
  key: string,
  value: unknown,
): value is XUserCacheEntry {
  if (!value || typeof value !== "object") return false;

  const userId = (value as { userId?: unknown }).userId;
  const handle = (value as { handle?: unknown }).handle;
  const cachedAt = (value as { cachedAt?: unknown }).cachedAt;
  const lastVerifiedAt = (value as { lastVerifiedAt?: unknown }).lastVerifiedAt;

  if (typeof userId !== "string" || !userId) return false;
  if (typeof handle !== "string" || handle !== key) return false;
  if (typeof cachedAt !== "string") return false;
  if (typeof lastVerifiedAt !== "string") return false;

  return (
    Number.isFinite(new Date(cachedAt).getTime()) &&
    Number.isFinite(new Date(lastVerifiedAt).getTime())
  );
}

async function writeXUserCacheAtomic(cache: XUserCache): Promise<void> {
  const file = xUserCacheFilePath();
  const dir = path.dirname(file);
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const content = `${JSON.stringify(cache, null, 2)}\n`;

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(temp, content, "utf-8");

  try {
    await fs.rename(temp, file);
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => undefined);
    throw new Error(
      `X user cache write failed (fail-closed): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function loadXUserCacheStrict(): Promise<XUserCache> {
  const file = xUserCacheFilePath();
  let raw: string;

  try {
    raw = await fs.readFile(file, "utf-8");
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === "ENOENT") {
      const empty: XUserCache = {};
      await writeXUserCacheAtomic(empty);
      return empty;
    }

    throw new Error(
      `X user cache unreadable (fail-closed): ${fsError.message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("X user cache is corrupted (invalid JSON). Fail-closed.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("X user cache is corrupted (invalid object). Fail-closed.");
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (!isValidCacheEntry(key, value)) {
      throw new Error(
        "X user cache is corrupted (invalid entry). Fail-closed.",
      );
    }
  }

  return parsed as XUserCache;
}

function isExpired(entry: XUserCacheEntry): boolean {
  const cachedTime = new Date(entry.cachedAt).getTime();
  const ageMs = Date.now() - cachedTime;
  const ttlMs = env.X_USER_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  return ageMs > ttlMs;
}

async function getCachedUserId(handle: string): Promise<string | null> {
  const key = normalizeHandle(handle);
  return withXUserCacheLock(async () => {
    const cache = await loadXUserCacheStrict();
    const entry = cache[key];
    if (!entry) return null;
    if (isExpired(entry)) return null;
    return entry.userId;
  });
}

async function deleteCachedUserId(handle: string): Promise<void> {
  const key = normalizeHandle(handle);
  await withXUserCacheLock(async () => {
    const cache = await loadXUserCacheStrict();
    if (!(key in cache)) return;
    delete cache[key];
    await writeXUserCacheAtomic(cache);
  });
}

async function markCachedUserIdVerified(handle: string): Promise<void> {
  const key = normalizeHandle(handle);
  await withXUserCacheLock(async () => {
    const cache = await loadXUserCacheStrict();
    const entry = cache[key];
    if (!entry) return;
    entry.lastVerifiedAt = new Date().toISOString();
    await writeXUserCacheAtomic(cache);
  });
}

async function setCachedUserId(handle: string, userId: string): Promise<void> {
  const key = normalizeHandle(handle);
  await withXUserCacheLock(async () => {
    const cache = await loadXUserCacheStrict();
    const now = new Date().toISOString();
    cache[key] = {
      userId,
      handle: key,
      cachedAt: now,
      lastVerifiedAt: now,
    };
    await writeXUserCacheAtomic(cache);
  });
}

function isUserNotFoundError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
  return (
    message.includes("user not found") ||
    message.includes("could not find user") ||
    message.includes("could not find x user") ||
    message.includes("not found")
  );
}

async function resolveUserIdByHandle(
  handle: string,
  options?: { bypassCache?: boolean },
): Promise<{ userId: string; fromCache: boolean }> {
  if (!options?.bypassCache) {
    const cachedUserId = await getCachedUserId(handle);
    if (cachedUserId) {
      return { userId: cachedUserId, fromCache: true };
    }
  }

  if (!(await canSpend(env.COST_PER_USER_READ))) {
    throw new Error("Daily budget exceeded");
  }

  const client = readClient();
  const user = await client.v2.userByUsername(normalizeHandle(handle));
  if (!user.data?.id) throw new Error(`Could not find X user: ${handle}`);
  await addCost("readUser");
  await setCachedUserId(handle, user.data.id);
  return { userId: user.data.id, fromCache: false };
}

function readClient() {
  if (!env.X_BEARER_TOKEN) {
    throw new Error(
      "X_BEARER_TOKEN missing. Required for reading public posts.",
    );
  }
  return new TwitterApi(env.X_BEARER_TOKEN).readOnly;
}

function writeClient() {
  const required = [
    env.X_APP_KEY,
    env.X_APP_SECRET,
    env.X_ACCESS_TOKEN,
    env.X_ACCESS_SECRET,
  ];
  if (required.some((v) => !v)) {
    throw new Error(
      "X write credentials missing. Need X_APP_KEY, X_APP_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET.",
    );
  }

  return new TwitterApi({
    appKey: env.X_APP_KEY,
    appSecret: env.X_APP_SECRET,
    accessToken: env.X_ACCESS_TOKEN,
    accessSecret: env.X_ACCESS_SECRET,
  });
}

export async function getUserIdByHandle(handle: string): Promise<string> {
  const resolved = await resolveUserIdByHandle(handle);
  return resolved.userId;
}

export async function fetchRecentUserPosts(
  handle: string,
  maxResults = 5,
): Promise<SocialPost[]> {
  const normalizedMaxResults = Math.max(5, Math.min(maxResults, 100));
  const estimatedReadCost = normalizedMaxResults * env.COST_PER_POST_READ;

  if (!(await canSpend(estimatedReadCost))) {
    throw new Error("Daily budget exceeded");
  }

  const client = readClient();
  let resolved = await resolveUserIdByHandle(handle);
  let timeline;

  try {
    timeline = await client.v2.userTimeline(resolved.userId, {
      max_results: normalizedMaxResults,
      exclude: ["retweets", "replies"],
      "tweet.fields": ["created_at", "public_metrics"],
    });
  } catch (error) {
    if (!resolved.fromCache || !isUserNotFoundError(error)) {
      throw error;
    }

    console.warn(
      `[x-user-cache] Invalid cached userId for @${normalizeHandle(handle)}. Purging cache and retrying handle lookup once.`,
    );
    await deleteCachedUserId(handle);
    resolved = await resolveUserIdByHandle(handle, { bypassCache: true });

    try {
      timeline = await client.v2.userTimeline(resolved.userId, {
        max_results: normalizedMaxResults,
        exclude: ["retweets", "replies"],
        "tweet.fields": ["created_at", "public_metrics"],
      });
    } catch (retryError) {
      throw retryError;
    }

    console.warn(
      `[x-user-cache] Refreshed cached userId for @${normalizeHandle(handle)} after invalidation.`,
    );
  }

  if (resolved.fromCache) {
    await markCachedUserIdVerified(handle);
  }

  const tweets = timeline.tweets ?? [];

  for (let i = 0; i < tweets.length; i += 1) {
    await addCost("readPost");
  }

  return tweets.map((tweet: any) => ({
    id: tweet.id,
    platform: "x",
    authorHandle: handle.replace("@", ""),
    text: tweet.text,
    createdAt: tweet.created_at,
    url: `https://x.com/${handle.replace("@", "")}/status/${tweet.id}`,
    metrics: {
      likes: tweet.public_metrics?.like_count,
      replies: tweet.public_metrics?.reply_count,
      reposts: tweet.public_metrics?.retweet_count,
    },
  }));
}

export async function publishXReply(
  text: string,
  replyToPostId: string,
): Promise<{ id: string }> {
  if (!(await canSpend(env.COST_PER_POST_CREATE))) {
    throw new Error("Daily budget exceeded");
  }

  const client = writeClient();
  const result = await client.v2.tweet({
    text,
    reply: {
      in_reply_to_tweet_id: replyToPostId,
    },
  });

  await addCost("createPost");

  return { id: result.data.id };
}

export async function publishXPost(text: string): Promise<{ id: string }> {
  if (!(await canSpend(env.COST_PER_POST_CREATE))) {
    throw new Error("Daily budget exceeded");
  }

  const client = writeClient();
  const result = await client.v2.tweet(text);
  await addCost("createPost");
  return { id: result.data.id };
}
