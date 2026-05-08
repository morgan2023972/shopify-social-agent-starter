export type Platform = "x" | "devto";

export type LanguageCode = "fr" | "en";
export type LanguageMode = "match-post" | "target-review-language";

export type Target = {
  id: string;
  platform: Platform;
  handle: string;
  priority: number;
  angle: string;
  languageMode: LanguageMode;
  reviewLanguage: LanguageCode;
};

export type SocialPost = {
  id: string;
  platform: Platform;
  authorHandle: string;
  text: string;
  url: string;
  createdAt?: string;
  metrics?: {
    likes?: number;
    replies?: number;
    reposts?: number;
  };
};

export type ScoredPost = SocialPost & {
  score: number;
  reason: string;
};

export type QueueVariant = {
  text: string;
  reviewText: string;
  postLanguage: LanguageCode;
  publishLanguage: LanguageCode;
  reviewLanguage?: LanguageCode;
};

export type GeneratedCommentPayload = {
  postLanguage: LanguageCode;
  publishLanguage: LanguageCode;
  variants: Array<Pick<QueueVariant, "text" | "reviewText">>;
};

export type QueueItem = {
  id: string;
  type: "comment" | "post";
  platform: Platform;
  targetId: string;
  targetHandle: string;
  sourcePostId: string;
  sourcePostUrl: string;
  sourcePostText: string;
  score: number;
  reason: string;
  postLanguage: LanguageCode;
  publishLanguage: LanguageCode;
  reviewLanguage?: LanguageCode;
  variants: QueueVariant[];
  selectedText?: string;
  status: "pending" | "approved" | "published" | "rejected" | "failed";
  createdAt: string;
  publishedAt?: string;
  error?: string;
};

export type LegacyQueueItem = Omit<
  QueueItem,
  "postLanguage" | "publishLanguage" | "variants"
> & {
  postLanguage?: LanguageCode;
  publishLanguage?: LanguageCode;
  variants: string[];
};

export type UsageCallType = "readPost" | "readUser" | "createPost";

export type UsageStats = {
  date: string;
  cost: number;
  calls: {
    readPost: number;
    readUser: number;
    createPost: number;
  };
};
