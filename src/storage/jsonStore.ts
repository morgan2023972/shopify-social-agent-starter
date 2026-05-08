import fs from "node:fs/promises";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), "data");

export async function readJson<T>(filename: string, fallback: T): Promise<T> {
  const file = path.join(dataDir, filename);
  try {
    const raw = await fs.readFile(file, "utf-8");
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      throw new Error(
        `Invalid JSON in ${filename}. Fix or replace the file before retrying.`,
      );
    }
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === "ENOENT") {
      return fallback;
    }

    throw new Error(
      `Unable to read ${filename}. ${fsError.message || String(error)}`,
    );
  }
}

export async function writeJson<T>(filename: string, data: T): Promise<void> {
  const file = path.join(dataDir, filename);
  const dir = path.dirname(file);
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(data, null, 2) + "\n";

  await fs.mkdir(dir, { recursive: true });

  const handle = await fs.open(tempFile, "w");
  try {
    await handle.writeFile(content, "utf-8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await fs.rename(tempFile, file);
  } catch (error) {
    await fs.rm(tempFile, { force: true }).catch(() => undefined);
    throw new Error(
      `Unable to write ${filename} atomically. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
