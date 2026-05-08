import { rejectQueueItem } from "../queue/queueService";

export async function rejectQueueItemCommand(id?: string): Promise<void> {
  if (!id) {
    console.error("✖ Queue item not found");
    process.exitCode = 1;
    return;
  }

  try {
    await rejectQueueItem(id);
    console.log(`✔ Rejected ${id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message === "Queue item not found" ||
      message.startsWith("Cannot reject item with status:")
    ) {
      console.error(`✖ ${message}`);
    } else {
      console.error(`✖ ${message}`);
    }

    process.exitCode = 1;
  }
}
