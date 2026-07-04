// Phase 7: the agent-authoring path. An agent composes a GUP document from manifest
// vocabulary via typed constructors, gets validate-before-commit for structure, and
// non-throwing lint for suspect references. Unknown capabilities are safe at runtime
// (graceful fallback), so they lint rather than throw.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  GenUIClient,
  InMemoryStateModel,
  Kernel,
  KernelTransportHost,
  ValidationError,
  assign,
  assignFrom,
  authorDocument,
  createInMemoryTransportPair,
  document,
  guarded,
  invoke,
  lintManifestReferences,
  node,
  type Action,
  type ManifestPayload,
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
const manifestPayload = manifest.payload as ManifestPayload;

// The same live-cards UI as the fixture, but authored by an agent via constructors.
function authorLiveCards() {
  const root = node("board", "board-1", {
    props: { title: "Sales" },
    children: [
      node("metric", "metric-total", {
        props: { label: "Total" },
        read: { value: "computed_values.total" },
      }),
      node("table", "table-orders", {
        props: { columns: ["id", "amount"] },
        read: { rows: "fetched_sources.orders" },
        on: { rowSelect: [assignFrom("card_data.selected", "$event.id")] },
      }),
      node("actions", "btn-approve", {
        props: { label: "Approve" },
        gate: "card_data.selected != null",
        on: {
          tap: [
            assign("card_data.status", "approved"),
            guarded(invoke("approveOrder"), "requires.role = 'lead'"),
          ],
        },
      }),
    ],
  });
  return { root, message: authorDocument(root, { manifest: "live-cards/1.0" }) };
}

function makeKernelFor(docMessage: unknown): Kernel {
  const store = new InMemoryStateModel(manifestPayload.namespaces);
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
  return new Kernel(manifest, docMessage as never, { state: store });
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

test("an agent authors a valid document that passes validation, lints clean, and renders end-to-end", async () => {
  const { root, message } = authorLiveCards();

  // validate-before-commit already ran inside authorDocument (no throw).
  assert.equal(message.type, "document");
  // References all resolve against the manifest vocabulary.
  assert.deepEqual(lintManifestReferences(manifestPayload, document(root, { manifest: "live-cards/1.0" })), []);

  // The authored document drives the kernel over the wire.
  const host = new KernelTransportHost(manifest, message, makeKernelFor(message));
  const [h, c] = createInMemoryTransportPair();
  const client = new GenUIClient(c);
  client.start();
  await host.attach(h);

  assert.equal(find(client.getTree(), "metric-total")?.props.value, 150);
  assert.equal((find(client.getTree(), "table-orders")?.props.rows as unknown[]).length, 2);
  assert.equal(find(client.getTree(), "btn-approve")?.visible, false);

  await client.emit("table-orders", "rowSelect", { id: "order-42" });
  assert.equal(find(client.getTree(), "btn-approve")?.visible, true);
});

test("an unknown capability is structurally valid, is flagged by lint, and renders as fallback (no crash)", async () => {
  const root = node("board", "board-1", {
    props: { title: "Experimental" },
    children: [node("mystery-widget", "widget-1", { props: { label: "?" } })],
  });

  // Structure is valid: authoring must not throw on an unknown capability.
  const message = authorDocument(root, { manifest: "live-cards/1.0" });

  // Lint flags it as a warning (not an error).
  const warnings = lintManifestReferences(manifestPayload, document(root, { manifest: "live-cards/1.0" }));
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].code, "unknown-capability");
  assert.equal(warnings[0].node, "widget-1");

  // At runtime it resolves as a fallback node rather than crashing.
  const host = new KernelTransportHost(manifest, message, makeKernelFor(message));
  const [h, c] = createInMemoryTransportPair();
  const client = new GenUIClient(c);
  client.start();
  await host.attach(h);

  assert.equal(find(client.getTree(), "widget-1")?.fallback, true);
});

test("a structurally malformed document is rejected by validate-before-commit", () => {
  const badAction = { target: "card_data.x" } as unknown as Action; // missing required `do`
  const root = node("actions", "btn-x", { on: { tap: [badAction] } });
  assert.throws(
    () => authorDocument(root, { manifest: "live-cards/1.0" }),
    (err: unknown) => err instanceof ValidationError
  );
});

test("lint flags undeclared events and namespaces on an otherwise valid structure", () => {
  const root = node("board", "board-1", {
    children: [
      // `table` declares emits ["rowSelect"], so `hover` is undeclared; `nowhere` is not a namespace.
      node("table", "t1", {
        read: { rows: "nowhere.value" },
        on: { hover: [assign("card_data.x", 1)] },
      }),
    ],
  });
  const warnings = lintManifestReferences(manifestPayload, document(root));
  const codes = warnings.map((w) => w.code).sort();
  assert.deepEqual(codes, ["undeclared-event", "undeclared-namespace"]);
});
