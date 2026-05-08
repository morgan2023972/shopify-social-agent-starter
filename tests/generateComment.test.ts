import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScoredPost, Target } from "../src/types";

const createMock = vi.fn();

vi.mock("openai", () => {
  return {
    default: class OpenAI {
      chat = {
        completions: {
          create: createMock,
        },
      };
      constructor(_input: unknown) {}
    },
  };
});

function makeTarget(overrides?: Partial<Target>): Target {
  return {
    id: "t1",
    platform: "x",
    handle: "ShopifyDevs",
    priority: 1,
    angle: "Shopify dev tools",
    languageMode: "match-post",
    reviewLanguage: "fr",
    ...overrides,
  };
}

function makePost(): ScoredPost {
  return {
    id: "p1",
    platform: "x",
    authorHandle: "dev",
    text: "Hydrogen update for faster storefront performance",
    url: "https://x.com/dev/status/1",
    score: 90,
    reason: "high relevance",
  };
}

describe("generateCommentVariants multilingual", () => {
  beforeEach(() => {
    vi.resetModules();
    createMock.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("enforces publishLanguage=postLanguage in match-post mode", async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              postLanguage: "fr",
              publishLanguage: "en",
              variants: [{ text: "Salut", reviewText: "Hi" }],
            }),
          },
        },
      ],
    });

    const { generateCommentVariants } =
      await import("../src/agents/generateComment");
    const out = await generateCommentVariants(
      makePost(),
      makeTarget({ languageMode: "match-post", reviewLanguage: "en" }),
    );

    expect(out.postLanguage).toBe("fr");
    expect(out.publishLanguage).toBe("fr");
    expect(out.variants).toHaveLength(1);
  });

  it("enforces publishLanguage=reviewLanguage in target-review-language mode", async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              postLanguage: "en",
              publishLanguage: "en",
              variants: [{ text: "Looks great", reviewText: "Looks great" }],
            }),
          },
        },
      ],
    });

    const { generateCommentVariants } =
      await import("../src/agents/generateComment");
    const out = await generateCommentVariants(
      makePost(),
      makeTarget({
        languageMode: "target-review-language",
        reviewLanguage: "fr",
      }),
    );

    expect(out.postLanguage).toBe("en");
    expect(out.publishLanguage).toBe("fr");
  });

  it("supports string variants and trims/clamps output", async () => {
    const long = "a".repeat(300);
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              postLanguage: "en",
              variants: [long, "ok"],
            }),
          },
        },
      ],
    });

    const { generateCommentVariants } =
      await import("../src/agents/generateComment");
    const out = await generateCommentVariants(makePost(), makeTarget());

    expect(out.variants[0].text.length).toBe(260);
    expect(out.variants[0].reviewText.length).toBe(260);
    expect(out.variants[1].text).toBe("ok");
  });

  it("returns safe fallback on invalid JSON", async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: "not-json" } }],
    });

    const { generateCommentVariants } =
      await import("../src/agents/generateComment");
    const out = await generateCommentVariants(
      makePost(),
      makeTarget({
        languageMode: "target-review-language",
        reviewLanguage: "fr",
      }),
    );

    expect(out.postLanguage).toBe("en");
    expect(out.publishLanguage).toBe("fr");
    expect(out.variants).toEqual([]);
  });
});
