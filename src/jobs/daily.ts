import { config } from "../config";
import type { Target } from "../types";
import { readJson, writeJson } from "../storage/jsonStore";
import { fetchRecentUserPosts } from "../platforms/xClient";
import { scorePost } from "../agents/scorePost";
import { generateCommentVariants } from "../agents/generateComment";
import { addToQueue } from "../queue/queueService";

async function main() {
  const targets = await readJson<Target[]>("targets.json", []);
  const seen = new Set(await readJson<string[]>("seen-posts.json", []));

  let queuedToday = 0;

  for (const target of targets.sort((a, b) => a.priority - b.priority)) {
    if (queuedToday >= config.maxCommentsPerDay) break;

    if (target.platform !== "x") {
      console.log(`Skipping unsupported platform for now: ${target.platform}`);
      continue;
    }

    console.log(`Reading @${target.handle}...`);
    const posts = await fetchRecentUserPosts(target.handle, 5);

    for (const post of posts) {
      if (queuedToday >= config.maxCommentsPerDay) break;
      if (seen.has(post.id)) continue;

      const scored = scorePost(post, target);
      seen.add(post.id);

      if (scored.score < config.minScoreToQueue) {
        console.log(`Skipped ${post.url} score=${scored.score}`);
        continue;
      }

      const generated = await generateCommentVariants(scored, target);
      if (generated.variants.length === 0) {
        console.log(`No variants generated for ${post.url}`);
        continue;
      }

      const item = await addToQueue({ target, post: scored, generated });
      queuedToday += 1;
      console.log(
        `Queued ${item.id} score=${item.score} ${item.sourcePostUrl}`,
      );
    }
  }

  await writeJson("seen-posts.json", Array.from(seen).slice(-1000));
  console.log(`Done. Queued ${queuedToday} item(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
