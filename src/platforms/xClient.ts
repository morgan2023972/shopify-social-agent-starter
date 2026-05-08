import { TwitterApi } from "twitter-api-v2";
import { env } from "../config";
import type { SocialPost } from "../types";

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
  const client = readClient();
  const user = await client.v2.userByUsername(handle.replace("@", ""));
  if (!user.data?.id) throw new Error(`Could not find X user: ${handle}`);
  return user.data.id;
}

export async function fetchRecentUserPosts(
  handle: string,
  maxResults = 5,
): Promise<SocialPost[]> {
  const client = readClient();
  const userId = await getUserIdByHandle(handle);

  const timeline = await client.v2.userTimeline(userId, {
    max_results: Math.max(5, Math.min(maxResults, 100)),
    exclude: ["retweets", "replies"],
    "tweet.fields": ["created_at", "public_metrics"],
  });

  const tweets = timeline.tweets ?? [];

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
  const client = writeClient();
  const result = await client.v2.tweet({
    text,
    reply: {
      in_reply_to_tweet_id: replyToPostId,
    },
  });

  return { id: result.data.id };
}

export async function publishXPost(text: string): Promise<{ id: string }> {
  const client = writeClient();
  const result = await client.v2.tweet(text);
  return { id: result.data.id };
}
