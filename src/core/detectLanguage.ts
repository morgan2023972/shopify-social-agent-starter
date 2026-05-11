export type SupportedLanguage = "en" | "fr";

const FR_WORDS = [
  "le",
  "la",
  "les",
  "des",
  "une",
  "avec",
  "pour",
  "dans",
  "tres",
  "très",
];
const EN_WORDS = [
  "the",
  "and",
  "with",
  "for",
  "this",
  "that",
  "dev",
  "tools",
  "very",
  "great",
  "tool",
];

function countWordMatches(text: string, words: string[]): number {
  return words.reduce((count, word) => {
    const pattern = new RegExp(`\\b${word}\\b`, "gi");
    const matches = text.match(pattern);
    return count + (matches ? matches.length : 0);
  }, 0);
}

export function detectLanguage(text: string): SupportedLanguage {
  const normalized = text.toLowerCase();

  if (/[éèàç]/i.test(normalized)) {
    return "fr";
  }

  const frScore = countWordMatches(normalized, FR_WORDS);
  const enScore = countWordMatches(normalized, EN_WORDS);

  if (frScore > enScore && frScore > 0) {
    return "fr";
  }

  if (enScore > 0) {
    return "en";
  }

  return "en";
}
