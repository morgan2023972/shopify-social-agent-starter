import type { ScoredPost, SocialPost, Target } from '../types';

const positiveKeywords = [
  'shopify', 'liquid', 'theme', 'themes', 'hydrogen', 'oxygen',
  'checkout', 'storefront', 'app', 'apps', 'performance',
  'metafield', 'metaobject', 'section', 'sections', 'dawn'
];

const negativeKeywords = [
  'hiring', 'job', 'politics', 'giveaway', 'discount', 'sale',
  'personal update', 'meme'
];

export function scorePost(post: SocialPost, target: Target): ScoredPost {
  const text = post.text.toLowerCase();

  let score = 30;
  const matches = positiveKeywords.filter((k) => text.includes(k));
  const negatives = negativeKeywords.filter((k) => text.includes(k));

  score += matches.length * 10;
  score -= negatives.length * 15;

  if (post.metrics?.replies !== undefined && post.metrics.replies < 50) score += 8;
  if (post.metrics?.likes !== undefined && post.metrics.likes > 3) score += 6;
  if (target.priority === 1) score += 8;
  if (text.includes('?')) score += 8;

  score = Math.max(0, Math.min(100, score));

  return {
    ...post,
    score,
    reason:
      matches.length > 0
        ? `Pertinent pour ${target.angle}. Mots-clés détectés: ${matches.join(', ')}.`
        : `Pertinence moyenne pour ${target.angle}; à valider manuellement.`
  };
}
