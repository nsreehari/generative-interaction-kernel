import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  createInMemoryTransportPair,
  InMemoryStateModel,
  Kernel,
  KernelTransportHost,
  type GupMessage,
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

test("transport host publishes manifest/document/init patch, then returns patches for inbound events", async () => {
  const [hostTransport, clientTransport] = createInMemoryTransportPair();
  const messages: GupMessage[] = [];
  clientTransport.subscribe((message) => {
    messages.push(message);
  });

  const host = new KernelTransportHost(manifest, document, makeKernel(), hostTransport);
  await host.start();

  assert.deepEqual(
    messages.map((message) => message.type),
    ["manifest", "document", "patch"]
  );
  assert.equal(messages[2].type, "patch");
  if (messages[2].type === "patch") {
    assert.equal(messages[2].payload.rev, 0);
    assert.deepEqual(messages[2].payload.ops, [
      { op: "set", path: "computed_values.approval.state", value: "draft" },
    ]);
  }

  await clientTransport.send({
    gup: "0.1",
    type: "event",
    payload: { node: "table-orders", name: "rowSelect", payload: { id: "order-42" } },
  });

  assert.equal(messages[3].type, "patch");
  if (messages[3].type === "patch") {
    assert.equal(messages[3].payload.rev, 1);
    assert.deepEqual(messages[3].payload.ops, [
      { op: "set", path: "card_data.selected", value: "order-42" },
    ]);
  }
});

test("transport host stops consuming inbound events after stop()", async () => {
  const [hostTransport, clientTransport] = createInMemoryTransportPair();
  const messages: GupMessage[] = [];
  clientTransport.subscribe((message) => {
    messages.push(message);
  });

  const host = new KernelTransportHost(manifest, document, makeKernel(), hostTransport);
  await host.start();
  host.stop();

  await clientTransport.send({
    gup: "0.1",
    type: "event",
    payload: { node: "table-orders", name: "rowSelect", payload: { id: "order-42" } },
  });

  assert.deepEqual(
    messages.map((message) => message.type),
    ["manifest", "document", "patch"]
  );
});