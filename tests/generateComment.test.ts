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

function makePost(overrides?: Partial<ScoredPost>): ScoredPost {
  return {
    id: "p1",
    platform: "x",
    authorHandle: "dev",
    text: "Hydrogen update for faster storefront performance",
    url: "https://x.com/dev/status/1",
    score: 90,
    reason: "high relevance",
    ...overrides,
  };
}

describe("generateCommentVariants multilingual", () => {
  beforeEach(() => {
    vi.resetModules();
    createMock.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("supports EN post with auto mode and FR review text", async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              variants: [
                {
                  text: "Great update for dev tools.",
                  reviewText: "Super mise a jour pour les outils dev.",
                },
              ],
            }),
          },
        },
      ],
    });

    const { generateCommentVariants } =
      await import("../src/agents/generateComment");
    const out = await generateCommentVariants(
      makePost({
        text: "This dev tools update improves storefront workflows.",
      }),
      makeTarget({ languageMode: "auto", reviewLanguage: "fr" }),
    );

    expect(out.postLanguage).toBe("en");
    expect(out.publishLanguage).toBe("en");
    expect(out.variants).toHaveLength(1);
    expect(out.variants[0].text).toContain("dev tools");
    expect(out.variants[0].reviewText).toContain("mise a jour");
  });

  it("supports FR post with auto mode", async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              variants: [
                {
                  text: "Belle amelioration pour les developpeurs Shopify.",
                },
              ],
            }),
          },
        },
      ],
    });

    const { generateCommentVariants } =
      await import("../src/agents/generateComment");
    const out = await generateCommentVariants(
      makePost({ text: "Une mise a jour tres utile pour les devs Shopify." }),
      makeTarget({
        languageMode: "auto",
        reviewLanguage: "fr",
      }),
    );

    expect(out.postLanguage).toBe("fr");
    expect(out.publishLanguage).toBe("fr");
    expect(out.variants[0].reviewText).toBeUndefined();
  });

  it("supports explicit override languageMode=fr", async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              variants: [
                {
                  text: "Bonne perspective cote performance storefront.",
                },
              ],
            }),
          },
        },
      ],
    });

    const { generateCommentVariants } =
      await import("../src/agents/generateComment");
    const out = await generateCommentVariants(
      makePost({ text: "This update improves tools for storefront devs." }),
      makeTarget({ languageMode: "fr", reviewLanguage: "fr" }),
    );

    expect(out.postLanguage).toBe("en");
    expect(out.publishLanguage).toBe("fr");
  });

  it("keeps legacy match-post behavior as auto", async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              variants: [{ text: "Analyse utile pour les themes Shopify." }],
            }),
          },
        },
      ],
    });

    const { generateCommentVariants } =
      await import("../src/agents/generateComment");
    const out = await generateCommentVariants(
      makePost({ text: "Les outils themes Shopify sont tres utiles." }),
      makeTarget({ languageMode: "match-post", reviewLanguage: "fr" }),
    );

    expect(out.postLanguage).toBe("fr");
    expect(out.publishLanguage).toBe("fr");
  });

  it("keeps legacy target-review-language behavior", async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              variants: [
                {
                  text: "Tres bon signal sur la qualite de review.",
                  reviewText: "Tres bon signal sur la qualite de review.",
                },
              ],
            }),
          },
        },
      ],
    });

    const { generateCommentVariants } =
      await import("../src/agents/generateComment");
    const out = await generateCommentVariants(
      makePost({ text: "This update helps app review tools." }),
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
    const out = await generateCommentVariants(
      makePost(),
      makeTarget({ languageMode: "auto", reviewLanguage: "en" }),
    );

    expect(out.variants[0].text.length).toBe(260);
    expect(out.variants[0].reviewText).toBeUndefined();
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
