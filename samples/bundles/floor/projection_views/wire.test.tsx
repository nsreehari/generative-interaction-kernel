// Phase 5 binding test: the same React components render over the wire. A GIKClient
// (transport-backed, never sees the kernel) drives GenUIRoot; an event round-trips to
// a re-render. Proves the binding is source-agnostic (controller vs client).

import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  GIKClient,
  InMemoryStateModel,
  Kernel,
  KernelTransportHost,
  createInMemoryTransportPair,
} from "@gik/kernel";
import { GenUIRoot } from "@gik/react";
import { floorRegistry } from "./components";

const fx = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../../schemas/fixtures/${name}`, import.meta.url)),
      "utf8"
    )
  );

const manifest = fx("live-cards.vocabulary.json");
const document = fx("example.program.json");

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

test("React components render over the wire via GIKClient, and an event re-renders", async () => {
  const [hostTransport, clientTransport] = createInMemoryTransportPair();
  const client = new GIKClient(clientTransport);
  client.start();

  const host = new KernelTransportHost(manifest, document, makeKernel(), hostTransport);
  await host.start();

  // The client's wire-reconstructed tree drives the real React components.
  const before = renderToStaticMarkup(
    React.createElement(GenUIRoot, { source: client, registry: floorRegistry })
  );
  assert.match(before, /order-42/);
  assert.match(before, /150/);
  assert.doesNotMatch(before, /Approve/, "gated Approve button is absent before selection");

  // Round-trip an interaction over the transport; the client re-resolves.
  await client.emit("table-orders", "rowSelect", { id: "order-42" });

  const after = renderToStaticMarkup(
    React.createElement(GenUIRoot, { source: client, registry: floorRegistry })
  );
  assert.match(after, /Approve/, "gate opens after selection, over the wire");
});
