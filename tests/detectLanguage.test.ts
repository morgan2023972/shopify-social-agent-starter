import { describe, expect, it } from "vitest";
import { detectLanguage } from "../src/core/detectLanguage";

describe("detectLanguage", () => {
  it("detects english text", () => {
    const language = detectLanguage(
      "This update improves dev tools for storefront apps.",
    );
    expect(language).toBe("en");
  });

  it("detects french text with accents", () => {
    const language = detectLanguage(
      "Une très belle amélioration avec des tests côté thème.",
    );
    expect(language).toBe("fr");
  });

  it("detects french text without accents", () => {
    const language = detectLanguage(
      "Une mise a jour utile avec des outils dans le theme.",
    );
    expect(language).toBe("fr");
  });

  it("detects mixed english and french text as french", () => {
    const language = detectLanguage("Great tool pour Shopify devs, très utile");
    expect(language).toBe("fr");
  });

  it("detects english when english dominates in mixed EN/FR content", () => {
    const language = detectLanguage(
      "Great tool, very useful pour Shopify devs",
    );
    expect(language).toBe("en");
  });

  it("falls back to english", () => {
    const language = detectLanguage("12345 -- ???");
    expect(language).toBe("en");
  });
});
