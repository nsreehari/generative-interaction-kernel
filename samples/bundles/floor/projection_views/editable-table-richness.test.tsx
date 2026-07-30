import { test } from "vitest";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { Json } from "@gik/kernel";

import { FallbackView, buildRegistryFromImports, renderNode } from "@gik/react";
import {
  FLOOR_COMPONENTS,
  appendEditableRowOnLastRowFocus,
  committedEditableRows,
  withTrailingEditableRow,
} from "./index";

const registry = buildRegistryFromImports(
  { ui: { from: "floor" } },
  (from) => from === "floor" ? FLOOR_COMPONENTS : undefined,
  FallbackView
);

function leaf(capability: string, props: Record<string, unknown>) {
  return {
    capability,
    id: capability,
    props: props as Record<string, Json>,
    visible: true,
    fallback: false,
    children: [],
  };
}

function render(props: Record<string, unknown>): string {
  return renderToStaticMarkup(renderNode(leaf("ui:editable-table", props), registry, () => {}));
}

test("editable-table derives columns from the union of keys across ragged rows", () => {
  // No spec.columns / schema: later rows introduce a field the first row lacks.
  const markup = render({ rows: [{ name: "A" }, { name: "B", amount: 3 }] });
  assert.match(markup, /<th>name<\/th>/i);
  assert.match(markup, /<th>amount<\/th>/i);
});

test("editable-table renders schema-defined columns when rows are empty", () => {
  const markup = render({
    spec: {
      schema: {
        properties: {
          ticker: { type: "string" },
          quantity: { type: "number" },
          costBasis: { type: "number" },
        },
      },
    },
    rows: [],
  });
  assert.match(markup, /<th>ticker<\/th>/i);
  assert.match(markup, /<th>quantity<\/th>/i);
  assert.match(markup, /<th>costBasis<\/th>/i);
  assert.doesNotMatch(markup, />No data</i);
  assert.equal((markup.match(/<input/g) ?? []).length, 3);
});

test("editable-table maintains one trailing draft row and omits blank rows when committed", () => {
  const columns = ["ticker", "quantity"];
  const rows = withTrailingEditableRow([{ ticker: "MSFT", quantity: 2 }], columns);

  assert.deepEqual(rows, [
    { ticker: "MSFT", quantity: 2 },
    { ticker: "", quantity: "" },
  ]);
  assert.equal(withTrailingEditableRow(rows, columns), rows);
  assert.deepEqual(committedEditableRows(rows), [{ ticker: "MSFT", quantity: 2 }]);
});

test("editable-table appends a fresh row only when the last row receives focus", () => {
  const columns = ["ticker"];
  const rows = [{ ticker: "MSFT" }, { ticker: "" }];

  assert.equal(appendEditableRowOnLastRowFocus(rows, columns, 0), rows);
  assert.deepEqual(appendEditableRowOnLastRowFocus(rows, columns, 1), [
    ...rows,
    { ticker: "" },
  ]);
});

test("editable-table renders themed table + inputs (no inline styles)", () => {
  const markup = render({ rows: [{ name: "Budget", amount: 3 }] });
  assert.match(markup, /class="gx-table gx-table-editable"/);
  assert.match(markup, /class="gx-editable-table"/);
  // The old hand-rolled inline grid/flex styling must be gone.
  assert.doesNotMatch(markup, /style="display:grid/);
  assert.doesNotMatch(markup, /style="display:flex/);
});

test("editable-table types numeric cells as number inputs with step=any", () => {
  const markup = render({
    spec: { schema: { properties: { name: { type: "string" }, amount: { type: "integer" } } } },
    rows: [{ name: "Budget", amount: 3 }],
  });
  // amount is schema-numeric -> number input with step="any"; name stays text.
  assert.match(markup, /type="number"[^>]*step="any"|step="any"[^>]*type="number"/);
  assert.match(markup, /type="text"/);
});

test("editable-table exposes the shared add-row control in a gx-panel-actions row", () => {
  const markup = render({ rows: [{ name: "A" }] });
  assert.match(markup, /class="gx-panel-actions"/);
  assert.match(markup, /class="gx-btn"[^>]*>\+ Add row/);
});

test("editable-table hides the add-row control when addRow is false", () => {
  const markup = render({ spec: { addRow: false }, rows: [{ name: "A" }] });
  assert.doesNotMatch(markup, /\+ Add row/);
});

test("editable-table renders a delete affordance by default and hides it when deleteRow is false", () => {
  const withDelete = render({ rows: [{ name: "A" }] });
  assert.match(withDelete, /class="gx-cell-delete"/);
  assert.match(withDelete, /aria-label="remove row 1"/);

  const withoutDelete = render({ spec: { deleteRow: false }, rows: [{ name: "A" }] });
  assert.doesNotMatch(withoutDelete, /gx-cell-delete/);
});
