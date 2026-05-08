import OpenAI from "openai";
import { env } from "../config";
import type {
  GeneratedCommentPayload,
  LanguageCode,
  ScoredPost,
  Target,
} from "../types";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 30_000 });

const DEFAULT_REVIEW_LANGUAGE: LanguageCode = "fr";

function normalizeLanguage(
  value: unknown,
  fallback: LanguageCode,
): LanguageCode {
  return value === "fr" ? "fr" : value === "en" ? "en" : fallback;
}

function resolvePublishLanguage(params: {
  postLanguage: LanguageCode;
  reviewLanguage: LanguageCode;
  languageMode: Target["languageMode"];
}): LanguageCode {
  if (params.languageMode === "target-review-language") {
    return params.reviewLanguage;
  }
  return params.postLanguage;
}

function clampVariantText(value: string): string {
  return value.length > 260 ? value.slice(0, 260) : value;
}

export async function generateCommentVariants(
  post: ScoredPost,
  target: Target,
): Promise<GeneratedCommentPayload> {
  const languageMode = target.languageMode ?? "match-post";
  const reviewLanguage = target.reviewLanguage ?? DEFAULT_REVIEW_LANGUAGE;

  const prompt = `
Tu es un développeur Shopify qui construit des outils gratuits pour développeurs Shopify.

Objectif:
Écrire des réponses naturelles, utiles et crédibles à un post X.

Contraintes:
- Détecte la langue du post source et renvoie-la dans postLanguage ("fr" ou "en").
- languageMode=${languageMode}
- reviewLanguage=${reviewLanguage}
- publishLanguage doit être:
  - postLanguage si languageMode="match-post"
  - reviewLanguage si languageMode="target-review-language"
- Maximum 260 caractères par variante.
- Pas de lien.
- Pas de vente agressive.
- Pas de "check my tool".
- Ton humain, dev-to-dev.
- Ajouter une observation concrète.
- Une variante peut finir par une question pertinente.
- Ne pas répéter le texte du post.
- Ne pas inventer de fait technique non présent dans le post.

Compte cible: @${target.handle}
Angle du compte: ${target.angle}

Post source:
${post.text}

Génère exactement 3 variantes, au format JSON:
{
  "postLanguage": "fr|en",
  "publishLanguage": "fr|en",
  "variants": [
    { "text": "...", "reviewText": "..." },
    { "text": "...", "reviewText": "..." },
    { "text": "...", "reviewText": "..." }
  ]
}

Règles de sortie:
- text doit être rédigé en publishLanguage.
- reviewText doit être rédigé en reviewLanguage pour relecture humaine.
- Respect strict du mode de langue demandé.
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content:
          "Tu génères des commentaires social media courts, humains et non-spam.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  const fallback: GeneratedCommentPayload = {
    postLanguage: "en",
    publishLanguage: resolvePublishLanguage({
      postLanguage: "en",
      reviewLanguage,
      languageMode,
    }),
    variants: [],
  };

  const raw = response.choices[0]?.message?.content ?? JSON.stringify(fallback);

  try {
    const parsed = JSON.parse(raw);

    const postLanguage = normalizeLanguage(parsed.postLanguage, "en");
    const publishLanguage = resolvePublishLanguage({
      postLanguage,
      reviewLanguage,
      languageMode,
    });
    const variants = Array.isArray(parsed.variants)
      ? parsed.variants
          .slice(0, 3)
          .map((variant: unknown) => {
            if (typeof variant === "string") {
              const clean = clampVariantText(variant.trim());
              return clean ? { text: clean, reviewText: clean } : null;
            }
            if (variant && typeof variant === "object") {
              const text =
                typeof (variant as { text?: unknown }).text === "string"
                  ? (variant as { text: string }).text
                  : "";
              const reviewText =
                typeof (variant as { reviewText?: unknown }).reviewText ===
                "string"
                  ? (variant as { reviewText: string }).reviewText
                  : text;
              const cleanText = clampVariantText(text.trim());
              const cleanReviewText = clampVariantText(reviewText.trim());
              return cleanText
                ? {
                    text: cleanText,
                    reviewText: cleanReviewText || cleanText,
                  }
                : null;
            }
            return null;
          })
          .filter(
            (
              variant: { text: string; reviewText: string } | null,
            ): variant is { text: string; reviewText: string } =>
              variant !== null,
          )
      : [];

    return { postLanguage, publishLanguage, variants };
  } catch {
    return fallback;
  }
}
