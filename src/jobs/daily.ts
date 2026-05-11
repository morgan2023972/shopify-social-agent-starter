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
    const posts = await fetchRecentUserPosts(
      target.handle,
      config.maxPostsPerAccount,
    );

    console.log(
      `[debug] target=@${target.handle} fetched=${posts.length} posts`,
    );

    for (const post of posts) {
      const snippet = post.text.slice(0, 80).replace(/\n/g, " ");

      if (queuedToday >= config.maxCommentsPerDay) {
        console.log(
          `[debug] post=${post.id} target=@${target.handle} decision=skip reason="max comments reached (${queuedToday}/${config.maxCommentsPerDay})" text="${snippet}"`,
        );
        break;
      }

      if (seen.has(post.id)) {
        console.log(
          `[debug] post=${post.id} target=@${target.handle} decision=skip reason="already processed" text="${snippet}"`,
        );
        continue;
      }

      if (!post.text.trim()) {
        seen.add(post.id);
        console.log(
          `[debug] post=${post.id} target=@${target.handle} decision=skip reason="empty text"`,
        );
        continue;
      }

      const scored = scorePost(post, target);
      seen.add(post.id);

      if (scored.score < config.minScoreToQueue) {
        console.log(
          `[debug] post=${post.id} target=@${target.handle} score=${scored.score} min=${config.minScoreToQueue} decision=skip reason="score below threshold" text="${snippet}"`,
        );
        continue;
      }

      console.log(
        `[debug] post=${post.id} target=@${target.handle} score=${scored.score} min=${config.minScoreToQueue} decision=generate text="${snippet}"`,
      );

      const generated = await generateCommentVariants(scored, target);

      if (generated.variants.length === 0) {
        console.log(
          `[debug] post=${post.id} target=@${target.handle} decision=skip reason="generation failed (0 variants)"`,
        );
        continue;
      }

      console.log(
        `[debug] post=${post.id} target=@${target.handle} variants=${generated.variants.length} → queuing`,
      );

      const item = await addToQueue({ target, post: scored, generated });
      queuedToday += 1;
      console.log(
        `[debug] post=${post.id} target=@${target.handle} decision=queued id=${item.id} queuedToday=${queuedToday}/${config.maxCommentsPerDay}`,
      );
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
