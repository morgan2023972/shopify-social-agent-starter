import { describe, expect, it } from "vitest";
import { renderQueueItems } from "../src/cli/renderQueue";
import type { QueueItem } from "../src/types";

describe("renderQueueItems", () => {
  it("includes post/publish/review languages and variant texts", () => {
    const items: QueueItem[] = [
      {
        id: "q_1",
        type: "comment",
        platform: "x",
        targetId: "t_1",
        targetHandle: "ShopifyDevs",
        sourcePostId: "p_1",
        sourcePostUrl: "https://x.com/shopifydevs/status/1",
        sourcePostText: "Source",
        score: 87,
        reason: "relevant",
        postLanguage: "fr",
        publishLanguage: "en",
        reviewLanguage: "fr",
        variants: [
          {
            text: "Public text",
            reviewText: "Texte review",
            postLanguage: "fr",
            publishLanguage: "en",
            reviewLanguage: "fr",
          },
        ],
        selectedText: "Public text",
        status: "pending",
        createdAt: "2026-05-08T00:00:00.000Z",
      },
    ];

    const output = renderQueueItems(items);

    expect(output).toContain("Lang: post=fr publish=en review=fr");
    expect(output).toContain("text: Public text");
    expect(output).toContain("reviewText: Texte review");
  });
});
