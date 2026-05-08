import { approveQueueItem, getQueue } from "./queue/queueService";
import { publishApproved } from "./publish/publishApproved";
import { rejectQueueItemCommand } from "./cli/rejectQueueItem";
import { cleanupQueueCommand } from "./cli/cleanupQueue";
import { migrateQueueCommand } from "./cli/migrateQueue";
import { usageResetCommand, usageShowCommand } from "./cli/usageCommands";
import { dailyEstimateCommand } from "./cli/dailyEstimate";
import { renderQueueItems } from "./cli/renderQueue";

async function main() {
  const args = process.argv.slice(2);
  const [cmd, arg1, arg2] = args;

  if (!cmd || cmd === "help") {
    console.log(`
Commands:
  npm run daily
  npm run daily:estimate
  npm run queue:list
  npm run queue:approve -- <id> [variantIndex]
  npm run queue:reject -- <id>
  npm run queue:cleanup
  npm run queue:migrate [-- --apply]
  npm run usage:show
  npm run usage:reset
  npm run publish
`);
    return;
  }

  if (cmd === "queue:list") {
    const queue = await getQueue();
    const output = renderQueueItems(queue);
    console.log(output);
    return;
  }

  if (cmd === "queue:approve") {
    if (!arg1) throw new Error("Missing queue item id");
    const variantIndex = arg2 ? Number(arg2) : 0;
    const item = await approveQueueItem(arg1, variantIndex);
    console.log(`Approved ${item.id}: ${item.selectedText}`);
    return;
  }

  if (cmd === "queue:reject") {
    await rejectQueueItemCommand(arg1);
    return;
  }

  if (cmd === "queue:cleanup") {
    await cleanupQueueCommand();
    return;
  }

  if (cmd === "queue:migrate") {
    const apply = args.includes("--apply");
    await migrateQueueCommand({ apply });
    return;
  }

  if (cmd === "usage:show") {
    await usageShowCommand();
    return;
  }

  if (cmd === "usage:reset") {
    await usageResetCommand();
    return;
  }

  if (cmd === "daily:estimate") {
    await dailyEstimateCommand();
    return;
  }

  if (cmd === "publish") {
    await publishApproved();
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
