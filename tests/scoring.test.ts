import { describe, expect, it } from "vitest";
import { scorePost } from "../src/agents/scorePost";
import type { SocialPost, Target } from "../src/types";

describe("scorePost", () => {
  it("scores a Shopify/dev post higher than an unrelated post", () => {
    const target: Target = {
      id: "t1",
      platform: "x",
      handle: "ShopifyDevs",
      priority: 1,
      angle: "Shopify dev tools",
      languageMode: "match-post",
      reviewLanguage: "fr",
    };

    const high: SocialPost = {
      id: "p1",
      platform: "x",
      authorHandle: "dev",
      text: "Shopify Hydrogen update for developers. Better storefront performance?",
      url: "https://x.com/dev/status/1",
      metrics: { likes: 20, replies: 10, reposts: 2 },
    };

    const low: SocialPost = {
      id: "p2",
      platform: "x",
      authorHandle: "random",
      text: "Beautiful sunset today by the sea.",
      url: "https://x.com/random/status/2",
      metrics: { likes: 1, replies: 0, reposts: 0 },
    };

    const highScored = scorePost(high, target);
    const lowScored = scorePost(low, target);

    expect(highScored.score).toBeGreaterThan(lowScored.score);
  });
});
