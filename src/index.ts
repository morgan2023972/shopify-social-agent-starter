import { approveQueueItem, getQueue } from "./queue/queueService";
import { publishApproved } from "./publish/publishApproved";
import { rejectQueueItemCommand } from "./cli/rejectQueueItem";
import { cleanupQueueCommand } from "./cli/cleanupQueue";

async function main() {
  const [cmd, arg1, arg2] = process.argv.slice(2);

  if (!cmd || cmd === "help") {
    console.log(`
Commands:
  npm run daily
  npm run queue:list
  npm run queue:approve -- <id> [variantIndex]
  npm run queue:reject -- <id>
  npm run queue:cleanup
  npm run publish
`);
    return;
  }

  if (cmd === "queue:list") {
    const queue = await getQueue();
    for (const item of queue) {
      console.log("\n---");
      console.log(
        `${item.id} | ${item.status} | score=${item.score} | @${item.targetHandle}`,
      );
      console.log(
        `Lang: post=${item.postLanguage} publish=${item.publishLanguage}`,
      );
      console.log(item.sourcePostUrl);
      console.log(`Reason: ${item.reason}`);
      item.variants.forEach((variant, i) => {
        console.log(`  [${i}] text: ${variant.text}`);
        console.log(`      reviewText: ${variant.reviewText}`);
      });
    }
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
