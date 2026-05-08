import type {
  GeneratedCommentPayload,
  LanguageCode,
  LegacyQueueItem,
  QueueItem,
  QueueVariant,
  ScoredPost,
  Target,
} from "../types";
import { readJson, writeJson } from "../storage/jsonStore";

function normalizeLanguage(
  input: unknown,
  fallback: LanguageCode,
): LanguageCode {
  return input === "fr" ? "fr" : input === "en" ? "en" : fallback;
}

function normalizeVariant(
  variant: unknown,
  postLanguage: LanguageCode,
  publishLanguage: LanguageCode,
): QueueVariant | null {
  if (typeof variant === "string") {
    return {
      text: variant,
      reviewText: variant,
      postLanguage,
      publishLanguage,
    };
  }

  if (!variant || typeof variant !== "object") return null;

  const text =
    typeof (variant as { text?: unknown }).text === "string"
      ? (variant as { text: string }).text
      : "";

  if (!text) return null;

  const reviewText =
    typeof (variant as { reviewText?: unknown }).reviewText === "string"
      ? (variant as { reviewText: string }).reviewText
      : text;

  return {
    text,
    reviewText,
    postLanguage: normalizeLanguage(
      (variant as { postLanguage?: unknown }).postLanguage,
      postLanguage,
    ),
    publishLanguage: normalizeLanguage(
      (variant as { publishLanguage?: unknown }).publishLanguage,
      publishLanguage,
    ),
  };
}

function normalizeQueueItem(raw: QueueItem | LegacyQueueItem): QueueItem {
  const postLanguage = normalizeLanguage(
    (raw as { postLanguage?: unknown }).postLanguage,
    "en",
  );
  const publishLanguage = normalizeLanguage(
    (raw as { publishLanguage?: unknown }).publishLanguage,
    postLanguage,
  );

  const variants = Array.isArray(raw.variants)
    ? raw.variants
        .map((variant) =>
          normalizeVariant(variant, postLanguage, publishLanguage),
        )
        .filter((variant): variant is QueueVariant => variant !== null)
    : [];

  return {
    ...raw,
    postLanguage,
    publishLanguage,
    variants,
  };
}

export async function getQueue(): Promise<QueueItem[]> {
  const rawQueue = await readJson<Array<QueueItem | LegacyQueueItem>>(
    "queue.json",
    [],
  );
  return rawQueue.map(normalizeQueueItem);
}

export async function saveQueue(queue: QueueItem[]): Promise<void> {
  await writeJson("queue.json", queue);
}

export async function addToQueue(params: {
  target: Target;
  post: ScoredPost;
  generated: GeneratedCommentPayload;
}): Promise<QueueItem> {
  const queue = await getQueue();

  const existing = queue.find((item) => item.sourcePostId === params.post.id);
  if (existing) return existing;

  const variants: QueueVariant[] = params.generated.variants.map((variant) => ({
    text: variant.text,
    reviewText: variant.reviewText,
    postLanguage: params.generated.postLanguage,
    publishLanguage: params.generated.publishLanguage,
  }));

  const item: QueueItem = {
    id: `q_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    type: "comment",
    platform: params.target.platform,
    targetId: params.target.id,
    targetHandle: params.target.handle,
    sourcePostId: params.post.id,
    sourcePostUrl: params.post.url,
    sourcePostText: params.post.text,
    score: params.post.score,
    reason: params.post.reason,
    postLanguage: params.generated.postLanguage,
    publishLanguage: params.generated.publishLanguage,
    variants,
    selectedText: variants[0]?.text,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  queue.push(item);
  await saveQueue(queue);
  return item;
}

export async function approveQueueItem(
  id: string,
  variantIndex = 0,
): Promise<QueueItem> {
  const queue = await getQueue();
  const item = queue.find((q) => q.id === id);
  if (!item) throw new Error(`Queue item not found: ${id}`);

  item.selectedText =
    item.variants[variantIndex]?.text ?? item.variants[0]?.text;
  item.status = "approved";

  await saveQueue(queue);
  return item;
}

const CLEANUP_DEFAULT_STATUSES: QueueItem["status"][] = [
  "rejected",
  "published",
];

export async function cleanupQueue(options?: {
  statuses?: QueueItem["status"][];
}): Promise<{ removed: number; kept: number }> {
  const statusesToRemove = options?.statuses ?? CLEANUP_DEFAULT_STATUSES;
  const queue = await getQueue();

  const kept = queue.filter((item) => !statusesToRemove.includes(item.status));
  const removed = queue.length - kept.length;

  await saveQueue(kept);
  return { removed, kept: kept.length };
}

export async function rejectQueueItem(id: string): Promise<void> {
  const queue = await getQueue();
  const item = queue.find((q) => q.id === id);

  if (!item) {
    throw new Error("Queue item not found");
  }

  if (item.status !== "pending") {
    throw new Error(`Cannot reject item with status: ${item.status}`);
  }

  const updatedQueue = queue.map((entry) =>
    entry.id === id
      ? {
          ...entry,
          status: "rejected" as const,
          selectedText: undefined,
        }
      : entry,
  );

  await saveQueue(updatedQueue);
}
