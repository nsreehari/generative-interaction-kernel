// Phase 6: reconnection. The host is a broker that keeps a patch log and onboards
// each connection — full snapshot for a fresh/late client, incremental replay for a
// client resuming from a known rev. A disconnected client catches up on reconnect.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  GenUIClient,
  InMemoryStateModel,
  Kernel,
  KernelTransportHost,
  createInMemoryTransportPair,
  type GupMessage,
  type ResolvedNode,
} from "../src/index";

const fx = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../schemas/fixtures/${name}`, import.meta.url)),
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

test("a disconnected client resumes from its rev via incremental replay; a late client full-syncs", async () => {
  const host = new KernelTransportHost(manifest, document, makeKernel());

  // Client 1 connects.
  const [h1, c1t] = createInMemoryTransportPair();
  const c1 = new GenUIClient(c1t);
  c1.start();
  await host.attach(h1);

  // Client 2 connects and stays.
  const [h2, c2t] = createInMemoryTransportPair();
  const c2 = new GenUIClient(c2t);
  c2.start();
  await host.attach(h2);

  // Client 1 selects a row -> rev 1; broadcast reaches both.
  await c1.emit("table-orders", "rowSelect", { id: "order-42" });
  assert.equal(c1.getRev(), 1);
  assert.equal(c2.getRev(), 1);

  // Client 1 drops off.
  const lastSeen = c1.getRev();
  host.detach(h1);
  c1.stop();

  // While client 1 is away, client 2 drives a change -> rev 2.
  await c2.emit("btn-approve", "tap");
  assert.equal(c2.getRev(), 2);
  assert.equal(c1.getRev(), 1, "detached client missed rev 2");

  // Client 1 reconnects on a fresh link and resumes from its last rev.
  const [h3, c3t] = createInMemoryTransportPair();
  const messagesOnResume: GupMessage[] = [];
  c3t.subscribe((m) => {
    messagesOnResume.push(m);
  });
  c1.rebind(c3t);
  await host.attach(h3, lastSeen);

  // Caught up to current rev via replay of the single missing patch only.
  assert.equal(c1.getRev(), 2, "resumed client caught up to current rev");
  assert.deepEqual(
    messagesOnResume.map((m) => m.type),
    ["patch"],
    "resume replays only the missing patch (no manifest/document re-onboard)"
  );

  // A brand-new late client full-syncs to current state (Approve visible from rev 1).
  const [h4, c4t] = createInMemoryTransportPair();
  const late = new GenUIClient(c4t);
  late.start();
  await host.attach(h4);
  assert.equal(late.getRev(), 2);
  assert.equal(find(late.getTree(), "btn-approve")?.visible, true);
});
