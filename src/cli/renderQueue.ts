import type { QueueItem } from "../types";

export function renderQueueItems(items: QueueItem[]): string {
  const lines: string[] = [];

  for (const item of items) {
    lines.push("");
    lines.push("---");
    lines.push(
      `${item.id} | ${item.status} | score=${item.score} | @${item.targetHandle}`,
    );
    lines.push(
      `Lang: post=${item.postLanguage} publish=${item.publishLanguage} review=${item.reviewLanguage ?? item.publishLanguage}`,
    );
    lines.push(item.sourcePostUrl);
    lines.push(`Reason: ${item.reason}`);

    item.variants.forEach((variant, i) => {
      lines.push(`  [${i}] text: ${variant.text}`);
      lines.push(`      reviewText: ${variant.reviewText ?? variant.text}`);
    });
  }

  return lines.join("\n");
}
