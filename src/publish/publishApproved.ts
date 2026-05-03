import { config } from '../config';
import { getQueue, saveQueue } from '../queue/queueService';
import { publishXReply } from '../platforms/xClient';

export async function publishApproved() {
  const queue = await getQueue();
  const approved = queue.filter((item) => item.status === 'approved');

  for (const item of approved) {
    try {
      if (!item.selectedText) throw new Error('No selected text');

      if (config.dryRun) {
        console.log(`[DRY RUN] Would publish reply to ${item.sourcePostUrl}`);
        console.log(item.selectedText);
        continue;
      }

      if (item.platform === 'x') {
        const result = await publishXReply(item.selectedText, item.sourcePostId);
        item.status = 'published';
        item.publishedAt = new Date().toISOString();
        console.log(`Published ${item.id}: ${result.id}`);
      } else {
        throw new Error(`Unsupported platform: ${item.platform}`);
      }
    } catch (error) {
      item.status = 'failed';
      item.error = error instanceof Error ? error.message : String(error);
      console.error(`Failed ${item.id}: ${item.error}`);
    }
  }

  if (!config.dryRun) {
    await saveQueue(queue);
  }
}
