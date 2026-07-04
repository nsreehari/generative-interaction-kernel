// Phase 8: concrete HTTP/SSE transport. Proves the transport seam carries the whole GUP
// protocol bidirectionally over a real loopback socket, and that `fromRev` conveyed as a
// query param drives an incremental resume (no full re-onboard).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  GenUIClient,
  InMemoryStateModel,
  Kernel,
  KernelTransportHost,
  type GupMessage,
  type ResolvedNode,
} from "../../../kernel/src/index";
import { SseClientTransport, SseFrameParser, SseTransportServer, encodeSseFrame } from "../src/index";

const fx = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../schemas/fixtures/${name}`, import.meta.url)),
      "utf8"
    )
  );

const manifest = fx("live-cards.manifest.json");
const document = fx("example.document.json");

function makeKernel(): Kernel {
  const store = new InMemoryStateModel(manifest.payload.namespaces);
  store.apply([
    {
      op: "set",
      path: "fetched_sources.orders",
      value: [
        { id: "order-42", amount: 100 },
        { id: "order-7", amount: 50 },
      ],
    },
    { op: "set", path: "computed_values.total", value: 150 },
  ]);
  return new Kernel(manifest, document, { state: store });
}

function find(node: ResolvedNode | null, id: string): ResolvedNode | undefined {
  if (!node) return undefined;
  if (node.id === id) return node;
  for (const child of node.children) {
    const hit = find(child, id);
    if (hit) return hit;
  }
  return undefined;
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

test("SseFrameParser reassembles frames split across chunks and ignores comments", () => {
  const parser = new SseFrameParser();
  const msg: GupMessage = { gup: "0.1", type: "event", payload: { node: "n", name: "tap" } };
  const wire = ":keep-alive\n\n" + encodeSseFrame(msg);
  // Feed the wire one byte at a time; the message should surface exactly once, whole.
  const out: GupMessage[] = [];
  for (const ch of wire) out.push(...parser.push(ch));
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], msg);
});

test("GenUIClient renders and round-trips an event over a real SSE connection", async () => {
  const host = new KernelTransportHost(manifest, document, makeKernel());
  const sse = new SseTransportServer(host);
  const server = createServer(async (req, res) => {
    if (!(await sse.handle(req, res))) res.writeHead(404).end();
  });
  const baseUrl = await listen(server);

  const client = new GenUIClient(new SseClientTransport(baseUrl));
  client.start();

  await waitFor(() => find(client.getTree(), "metric-total") !== undefined);
  assert.equal(find(client.getTree(), "metric-total")?.props.value, 150);
  assert.equal((find(client.getTree(), "table-orders")?.props.rows as unknown[]).length, 2);
  assert.equal(find(client.getTree(), "btn-approve")?.visible, false);

  await client.emit("table-orders", "rowSelect", { id: "order-42" });
  await waitFor(() => find(client.getTree(), "btn-approve")?.visible === true);
  assert.equal(client.getRev(), 1);

  client.stop();
  await close(server);
});

test("fromRev query param drives an incremental resume over SSE (no manifest re-onboard)", async () => {
  const host = new KernelTransportHost(manifest, document, makeKernel());
  const sse = new SseTransportServer(host);
  const server = createServer(async (req, res) => {
    if (!(await sse.handle(req, res))) res.writeHead(404).end();
  });
  const baseUrl = await listen(server);

  // A driving client advances state to rev 1.
  const driver = new GenUIClient(new SseClientTransport(baseUrl));
  driver.start();
  await waitFor(() => driver.getTree() !== null);
  await driver.emit("table-orders", "rowSelect", { id: "order-42" });
  await waitFor(() => driver.getRev() === 1);

  // A raw resuming stream asks for everything after rev 1. Drive one more change so there
  // is a rev 2 to replay, then open the resume stream and read its first frames.
  await driver.emit("btn-approve", "tap");
  await waitFor(() => driver.getRev() === 2);

  const frames: GupMessage[] = [];
  const controller = new AbortController();
  const res = await fetch(`${baseUrl}/gup/stream?fromRev=1`, { signal: controller.signal });
  const parser = new SseFrameParser();
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const readLoop = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        frames.push(...parser.push(decoder.decode(value, { stream: true })));
      }
    } catch {
      /* aborted */
    }
  })();

  await waitFor(() => frames.length >= 1);
  // Resume replays only patches after rev 1 — no manifest/document re-onboard.
  assert.equal(frames[0].type, "patch");
  assert.equal((frames[0] as { payload: { rev: number } }).payload.rev, 2);
  assert.ok(!frames.some((f) => f.type === "manifest" || f.type === "document"));

  controller.abort();
  await readLoop;
  driver.stop();
  await close(server);
});
