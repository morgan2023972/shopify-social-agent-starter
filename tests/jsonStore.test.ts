import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("jsonStore", () => {
  let tempRoot: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "json-store-"));
    await fs.mkdir(path.join(tempRoot, "data"), { recursive: true });
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempRoot);
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("valid queue.json reads normally", async () => {
    await fs.writeFile(
      path.join(tempRoot, "data", "queue.json"),
      JSON.stringify([{ id: "q1" }], null, 2),
      "utf-8",
    );

    const { readJson } = await import("../src/storage/jsonStore");
    const queue = await readJson<Array<{ id: string }>>("queue.json", []);

    expect(queue).toEqual([{ id: "q1" }]);
  });

  it("missing queue.json returns fallback safely", async () => {
    const { readJson } = await import("../src/storage/jsonStore");
    const queue = await readJson<Array<{ id: string }>>("queue.json", []);
    expect(queue).toEqual([]);
  });

  it("corrupted queue.json throws", async () => {
    await fs.writeFile(
      path.join(tempRoot, "data", "queue.json"),
      "{bad-json}",
      "utf-8",
    );

    const { readJson } = await import("../src/storage/jsonStore");

    await expect(readJson("queue.json", [])).rejects.toThrow(
      "Invalid JSON in queue.json",
    );
  });

  it("corrupted queue.json is not overwritten", async () => {
    const queueFile = path.join(tempRoot, "data", "queue.json");
    const corrupted = "{bad-json}";
    await fs.writeFile(queueFile, corrupted, "utf-8");

    const { readJson } = await import("../src/storage/jsonStore");
    await expect(readJson("queue.json", [])).rejects.toThrow();

    const current = await fs.readFile(queueFile, "utf-8");
    expect(current).toBe(corrupted);
  });

  it("atomic write produces valid JSON", async () => {
    const { writeJson } = await import("../src/storage/jsonStore");
    await writeJson("queue.json", [{ id: "q2", status: "pending" }]);

    const queueFile = path.join(tempRoot, "data", "queue.json");
    const raw = await fs.readFile(queueFile, "utf-8");
    const parsed = JSON.parse(raw) as Array<{ id: string; status: string }>;

    expect(parsed).toEqual([{ id: "q2", status: "pending" }]);

    const files = await fs.readdir(path.join(tempRoot, "data"));
    expect(
      files.filter(
        (name) => name.includes("queue.json.") && name.endsWith(".tmp"),
      ),
    ).toEqual([]);
  });
});
