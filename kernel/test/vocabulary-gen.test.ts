// Manifest generation: derive the manifest an authored document needs by walking its closed grammar.
// The inverse of authoring — a portability primitive (export a document + its generated manifest and
// another host can load it). A generated manifest must be able to drive the very document it came from.

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  Kernel,
  InMemoryStateModel,
  assign,
  assignFrom,
  authorProjectedProgram,
  projectedProgram,
  generateVocabulary,
  invoke,
  node,
  type CapabilityDescriptor,
  type ResolvedNode,
} from "../src/index";

function authorDoc() {
  return projectedProgram(
    node("board", "board-1", {
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
          on: { tap: [assign("card_data.status", "approved"), invoke("approveOrder")] },
        }),
      ],
    })
  );
}

test("generateVocabulary collects capabilities, namespaces, and action families a program uses", () => {
  const m = generateVocabulary(authorDoc());

  assert.deepEqual(
    Object.keys(m.capabilities).sort(),
    ["actions", "board", "metric", "table"],
    "every distinct capability the document uses is declared"
  );
  assert.deepEqual(
    [...(m.namespaces ?? [])].sort(),
    ["card_data", "computed_values", "fetched_sources"],
    "namespaces are collected from read edges and action targets"
  );
  assert.deepEqual(
    [...(m.actions ?? [])].sort(),
    ["assign", "invoke"],
    "action families are collected from on-handlers"
  );
  assert.equal(m.expression, "jsonata");
});

test("a supplied catalog is reused for used capabilities; unknown ones get a permissive descriptor", () => {
  const catalog: Record<string, CapabilityDescriptor> = {
    table: { propsSchema: { type: "object" }, emits: ["rowSelect"], dataProp: "rows" },
  };
  const m = generateVocabulary(authorDoc(), { version: "authored/1.0", catalog });

  assert.equal(m.version, "authored/1.0");
  assert.equal(m.capabilities.table.dataProp, "rows", "catalog descriptor is reused (keeps dataProp)");
  assert.deepEqual(m.capabilities.table.emits, ["rowSelect"]);
  // a capability absent from the catalog still gets declared, permissively.
  assert.ok(m.capabilities.board.propsSchema, "capabilities not in the catalog get a permissive descriptor");
});

test("a generated manifest can drive the very document it was generated from (round-trip)", async () => {
  const doc = authorDoc();
  const manifest = generateVocabulary(doc, { catalog: { table: { propsSchema: {}, dataProp: "rows" } } });

  const message = authorProjectedProgram(doc.root);
  const state = new InMemoryStateModel(manifest.namespaces ?? []);
  state.apply([
    { op: "set", path: "computed_values.total", value: 150 },
    { op: "set", path: "fetched_sources.orders", value: [{ id: "order-42", amount: 120 }] },
  ]);

  // constructing + resolving over the generated manifest must not throw.
  const kernel = new Kernel({ gik: "0.1", type: "vocabulary", payload: manifest }, message, { state });
  const tree = (await kernel.resolve()) as ResolvedNode;
  assert.equal(tree.capability, "board");
  assert.equal(tree.children.length, 3, "the document resolves in full under its generated manifest");
});
