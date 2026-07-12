// Phase 5: the client half of the protocol. A GIKClient runs purely off wire
// messages (manifest/document/patch) — no kernel — keeping a local state replica
// and resolving a renderable tree, and emits events back over the transport.

import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  GIKClient,
  InMemoryStateModel,
  Kernel,
  KernelTransportHost,
  createInMemoryTransportPair,
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

test("client renders purely from wire messages, then round-trips an event to a re-render", async () => {
  const [hostTransport, clientTransport] = createInMemoryTransportPair();

  const client = new GIKClient(clientTransport);
  let renders = 0;
  client.subscribe(() => {
    renders += 1;
  });
  client.start();

  const host = new KernelTransportHost(manifest, document, makeKernel(), hostTransport);
  await host.start();

  // The client reconstructed full state from the baseline patch alone.
  assert.equal(find(client.getTree(), "metric-total")?.props.value, 150);
  assert.equal((find(client.getTree(), "table-orders")?.props.rows as unknown[]).length, 2);
  // Gate: the Approve button is hidden until a row is selected.
  assert.equal(find(client.getTree(), "btn-approve")?.visible, false);
  assert.equal(client.getRev(), 0);
  const rendersAfterStart = renders;

  // Emit an interaction over the wire; the host reduces and the client re-renders.
  await client.emit("table-orders", "rowSelect", { id: "order-42" });

  assert.equal(client.getRev(), 1);
  assert.equal(find(client.getTree(), "btn-approve")?.visible, true, "gate opens after selection");
  assert.ok(renders > rendersAfterStart, "an inbound patch triggers a re-render");
});

test("client stops re-rendering after stop()", async () => {
  const [hostTransport, clientTransport] = createInMemoryTransportPair();
  const client = new GIKClient(clientTransport);
  client.start();

  const host = new KernelTransportHost(manifest, document, makeKernel(), hostTransport);
  await host.start();

  const revBefore = client.getRev();
  client.stop();

  await client.emit("table-orders", "rowSelect", { id: "order-42" });

  assert.equal(client.getRev(), revBefore, "no further patches applied after stop()");
});
