import OpenAI from "openai";
import { env } from "../config";
import { detectLanguage } from "../core/detectLanguage";
import type {
  GeneratedCommentPayload,
  LanguageCode,
  LanguageMode,
  ScoredPost,
  Target,
} from "../types";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 30_000 });

const DEFAULT_REVIEW_LANGUAGE: LanguageCode = "fr";
const DEFAULT_LANGUAGE_MODE: LanguageMode = "auto";

function normalizeLanguage(
  value: unknown,
  fallback: LanguageCode,
): LanguageCode {
  return value === "fr" ? "fr" : value === "en" ? "en" : fallback;
}

function resolveLanguageMode(mode: Target["languageMode"]): LanguageMode {
  if (!mode || mode === "match-post") return "auto";
  return mode;
}

function resolvePublishLanguage(params: {
  postLanguage: LanguageCode;
  reviewLanguage: LanguageCode;
  languageMode: LanguageMode;
}): LanguageCode {
  if (params.languageMode === "target-review-language")
    return params.reviewLanguage;
  if (params.languageMode === "en" || params.languageMode === "fr") {
    return params.languageMode;
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
  const postLanguage = detectLanguage(post.text);
  const languageMode = resolveLanguageMode(
    target.languageMode ?? DEFAULT_LANGUAGE_MODE,
  );
  const reviewLanguage = normalizeLanguage(
    target.reviewLanguage,
    DEFAULT_REVIEW_LANGUAGE,
  );
  const publishLanguage = resolvePublishLanguage({
    postLanguage,
    reviewLanguage,
    languageMode,
  });

  const prompt = `
Tu es un développeur Shopify qui construit des outils gratuits pour développeurs Shopify.

Objectif:
Écrire des réponses naturelles, utiles et crédibles à un post X.

Contraintes:
- postLanguage (déjà calculé côté code): ${postLanguage}
- publishLanguage (imposé côté code): ${publishLanguage}
- reviewLanguage (imposé côté code): ${reviewLanguage}
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
  "variants": [
    { "text": "...", "reviewText": "..." },
    { "text": "...", "reviewText": "..." },
    { "text": "...", "reviewText": "..." }
  ]
}

Règles de sortie:
- text doit être rédigé en publishLanguage.
- reviewText doit être rédigé en reviewLanguage pour relecture humaine.
- si publishLanguage != reviewLanguage: reviewText obligatoire (traduction fidèle de text).
- si publishLanguage == reviewLanguage: reviewText optionnel.
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
    postLanguage,
    publishLanguage,
    variants: [],
  };

  const raw = response.choices[0]?.message?.content ?? JSON.stringify(fallback);

  try {
    const parsed = JSON.parse(raw);
    const variants = Array.isArray(parsed.variants)
      ? parsed.variants
          .slice(0, 3)
          .map((variant: unknown) => {
            if (typeof variant === "string") {
              const clean = clampVariantText(variant.trim());
              if (!clean) return null;
              return publishLanguage === reviewLanguage
                ? { text: clean }
                : { text: clean, reviewText: clean };
            }
            if (variant && typeof variant === "object") {
              const text =
                typeof (variant as { text?: unknown }).text === "string"
                  ? (variant as { text: string }).text
                  : "";
              const rawReviewText =
                typeof (variant as { reviewText?: unknown }).reviewText ===
                "string"
                  ? (variant as { reviewText: string }).reviewText
                  : undefined;
              const cleanText = clampVariantText(text.trim());
              if (!cleanText) return null;

              if (publishLanguage !== reviewLanguage) {
                const cleanReviewText = rawReviewText
                  ? clampVariantText(rawReviewText.trim())
                  : "";
                return {
                  text: cleanText,
                  reviewText: cleanReviewText || cleanText,
                };
              }

              const cleanReviewText = rawReviewText
                ? clampVariantText(rawReviewText.trim())
                : "";

              return cleanReviewText
                ? { text: cleanText, reviewText: cleanReviewText }
                : { text: cleanText };
            }
            return null;
          })
          .filter(
            (
              variant: { text: string; reviewText?: string } | null,
            ): variant is { text: string; reviewText?: string } =>
              variant !== null,
          )
      : [];

    return { postLanguage, publishLanguage, variants };
  } catch {
    return fallback;
  }
}
