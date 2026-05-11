import { readFile } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getQueue, saveQueue } from "../queue/queueService";
import type { QueueItem } from "../types";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(__dirname, "public");

type DashboardQueueItem = QueueItem & {
  selectedVariantIndex?: number;
};

type JsonPayload =
  | { data: unknown; meta?: { count: number } }
  | { error: string };

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: JsonPayload,
): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(payload));
}

function ok(res: ServerResponse, data: unknown): void {
  sendJson(res, 200, { data });
}

function badRequest(res: ServerResponse, message: string): void {
  sendJson(res, 400, { error: message });
}

function notFound(res: ServerResponse, message = "Not found"): void {
  sendJson(res, 404, { error: message });
}

function internalError(
  res: ServerResponse,
  message = "Internal server error",
): void {
  sendJson(res, 500, { error: message });
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

async function serveStatic(
  res: ServerResponse,
  filePath: string,
): Promise<void> {
  const ext = filePath.slice(filePath.lastIndexOf(".")) as string;
  const contentType = MIME[ext] ?? "application/octet-stream";
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

function resolvePort(port?: number): number {
  if (typeof port === "number") {
    return port;
  }

  const configuredPort = Number(process.env.DASHBOARD_PORT ?? "3000");
  return Number.isFinite(configuredPort) ? configuredPort : 3000;
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: string[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf-8"));
  }

  const rawBody = chunks.join("").trim();
  if (!rawBody) {
    throw new Error("Invalid JSON body");
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function loadQueue(): Promise<DashboardQueueItem[]> {
  return (await getQueue()) as DashboardQueueItem[];
}

function validateVariantIndex(
  item: DashboardQueueItem,
  variantIndex: unknown,
): variantIndex is number {
  return (
    typeof variantIndex === "number" &&
    Number.isInteger(variantIndex) &&
    variantIndex >= 0 &&
    variantIndex < item.variants.length
  );
}

async function handleGetQueue(res: ServerResponse): Promise<void> {
  const queue = await loadQueue();
  const pendingItems = queue.filter((item) => item.status === "pending");
  sendJson(res, 200, {
    data: pendingItems,
    meta: {
      count: pendingItems.length,
    },
  });
}

async function handleApprove(
  res: ServerResponse,
  id: string,
  req: IncomingMessage,
): Promise<void> {
  const body = await readJsonBody(req);
  const variantIndex = (body as { variantIndex?: unknown }).variantIndex;

  const queue = await loadQueue();
  const item = queue.find((entry) => entry.id === id);

  if (!item) {
    notFound(res, "Queue item not found");
    return;
  }

  if (item.status !== "pending") {
    badRequest(res, "Queue item is not pending");
    return;
  }

  if (!validateVariantIndex(item, variantIndex)) {
    badRequest(res, "Invalid variantIndex");
    return;
  }

  item.status = "approved";
  item.selectedVariantIndex = variantIndex;
  item.selectedText = item.variants[variantIndex].text;

  await saveQueue(queue);
  ok(res, item);
}

async function handleReject(res: ServerResponse, id: string): Promise<void> {
  const queue = await loadQueue();
  const item = queue.find((entry) => entry.id === id);

  if (!item) {
    notFound(res, "Queue item not found");
    return;
  }

  if (item.status !== "pending") {
    badRequest(res, "Queue item is not pending");
    return;
  }

  item.status = "rejected";
  item.selectedText = undefined;
  delete item.selectedVariantIndex;

  await saveQueue(queue);
  ok(res, item);
}

async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  try {
    if (req.method === "GET" && pathname === "/api/queue") {
      await handleGetQueue(res);
      return;
    }

    const approveMatch = pathname.match(/^\/api\/queue\/([^/]+)\/approve$/);
    if (req.method === "POST" && approveMatch) {
      await handleApprove(res, decodeURIComponent(approveMatch[1]), req);
      return;
    }

    const rejectMatch = pathname.match(/^\/api\/queue\/([^/]+)\/reject$/);
    if (req.method === "POST" && rejectMatch) {
      await handleReject(res, decodeURIComponent(rejectMatch[1]));
      return;
    }

    notFound(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Invalid JSON body") {
      badRequest(res, message);
      return;
    }

    internalError(res, message || "Internal server error");
  }
}

function requestHandler(req: IncomingMessage, res: ServerResponse): void {
  const requestUrl = req.url ?? "/";
  const pathname = new URL(requestUrl, "http://localhost").pathname;

  if (isApiPath(pathname)) {
    void handleApiRequest(req, res, pathname);
    return;
  }

  if (req.method === "GET") {
    if (pathname === "/" || pathname === "/index.html") {
      void serveStatic(res, join(PUBLIC_DIR, "index.html"));
      return;
    }
    if (pathname === "/app.js") {
      void serveStatic(res, join(PUBLIC_DIR, "app.js"));
      return;
    }
    if (pathname === "/style.css") {
      void serveStatic(res, join(PUBLIC_DIR, "style.css"));
      return;
    }
  }

  notFound(res);
}

export async function startDashboardServer(port?: number) {
  const resolvedPort = resolvePort(port);
  const server = http.createServer(requestHandler);

  await new Promise<void>((resolve) => {
    server.listen(resolvedPort, "127.0.0.1", resolve);
  });

  const address = server.address();
  const actualPort =
    typeof address === "object" && address ? address.port : resolvedPort;

  console.log(`Dashboard API listening on http://127.0.0.1:${actualPort}`);
  return server;
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  void startDashboardServer();
}
