import { readJson, writeJson } from "../storage/jsonStore";

async function main() {
  const seen = await readJson<string[]>("seen-posts.json", []);
  const count = seen.length;
  await writeJson("seen-posts.json", []);
  console.log(`Cleared ${count} processed post ID(s) from seen-posts.json.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
