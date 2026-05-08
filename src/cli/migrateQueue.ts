import type { LegacyQueueItem, QueueItem } from "../types";
import { readJson } from "../storage/jsonStore";
import { getQueue, saveQueue } from "../queue/queueService";

export async function migrateQueueCommand(options?: {
  apply?: boolean;
}): Promise<{ changed: boolean; dryRun: boolean; migratedItems: number }> {
  const apply = options?.apply === true;
  const raw = await readJson<Array<QueueItem | LegacyQueueItem>>(
    "queue.json",
    [],
  );
  const normalized = await getQueue();

  const migratedItems = raw.filter((item) =>
    Array.isArray(item.variants)
      ? item.variants.some((variant) => typeof variant === "string")
      : false,
  ).length;

  const changed = JSON.stringify(raw) !== JSON.stringify(normalized);

  if (!changed) {
    console.log("Queue already normalized. No migration needed.");
    return { changed: false, dryRun: !apply, migratedItems: 0 };
  }

  if (!apply) {
    console.log(
      "[DRY RUN] Migration preview only. No file changes were applied.",
    );
    console.log(`Would migrate ${migratedItems} item(s).`);
    console.log("Run 'npm run queue:migrate -- --apply' to write changes.");
    return { changed: true, dryRun: true, migratedItems };
  }

  await saveQueue(normalized);
  console.log(`Queue migration applied. Migrated ${migratedItems} item(s).`);
  return { changed: true, dryRun: false, migratedItems };
}
