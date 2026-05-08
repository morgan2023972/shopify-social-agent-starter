import { cleanupQueue } from "../queue/queueService";

export async function cleanupQueueCommand(): Promise<void> {
  const result = await cleanupQueue();

  if (result.removed === 0 && result.kept === 0) {
    console.log("Queue is already empty.");
    return;
  }

  console.log("✔ Queue cleanup complete");
  console.log(`Removed: ${result.removed}`);
  console.log(`Kept: ${result.kept}`);
}
