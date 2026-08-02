import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import type { Json, ResolvedNode } from "@gik/kernel";

import {
  EditableTable,
  appendEditableRowOnLastRowFocus,
  committedEditableRows,
  editableTableColumns,
  editableTableDefinition,
  isEmptyEditableRow,
  withTrailingEditableRow,
} from "../src/primitives/editable-table";

function node(props: Record<string, unknown>): ResolvedNode {
  return {
    id: "editable-table-test",
    capability: "primitive:editable-table",
    props: props as Record<string, Json>,
    visible: true,
    fallback: false,
    children: [],
  };
}

function render(props: Record<string, unknown>): string {
  return renderToStaticMarkup(<EditableTable node={node(props)} emit={() => undefined} children={undefined} />);
}

test("editable table derives the union of ragged row columns in first-seen order", () => {
  assert.deepEqual(
    editableTableColumns({}, [{ name: "A" }, { name: "B", amount: 3 }, { status: "ready" }]),
    ["name", "amount", "status"],
  );

  const markup = render({ rows: [{ name: "A" }, { name: "B", amount: 3 }] });
  assert.match(markup, />name<\/div><\/th>/i);
  assert.match(markup, />amount<\/div><\/th>/i);
});

test("editable table prefers explicit columns, then schema columns", () => {
  const rows = [{ name: "Budget", amount: 3 }];
  assert.deepEqual(editableTableColumns({ columns: ["amount"] }, rows), ["amount"]);
  assert.deepEqual(
    editableTableColumns({ schema: { properties: { ticker: { type: "string" }, quantity: { type: "number" } } } }, []),
    ["ticker", "quantity"],
  );

  const markup = render({
    spec: { schema: { properties: { ticker: { type: "string" }, quantity: { type: "number" } } } },
    rows: [],
  });
  assert.match(markup, /ticker/);
  assert.match(markup, /quantity/);
  assert.equal((markup.match(/<input/g) ?? []).length, 2);
});

test("editable table maintains one trailing draft row and commits only nonempty rows", () => {
  const columns = ["ticker", "quantity"];
  const committed = { ticker: "MSFT", quantity: 2 };
  const rows = withTrailingEditableRow([committed], columns);

  assert.deepEqual(rows, [committed, { ticker: "", quantity: "" }]);
  assert.equal(withTrailingEditableRow(rows, columns), rows);
  assert.equal(isEmptyEditableRow(rows[1]), true);
  assert.deepEqual(committedEditableRows(rows), [committed]);
  assert.equal(appendEditableRowOnLastRowFocus(rows, columns, 0), rows);
  assert.deepEqual(appendEditableRowOnLastRowFocus(rows, columns, 1), [
    ...rows,
    { ticker: "", quantity: "" },
  ]);
});

test("editable table renders Fluent controls and honors add/delete configuration", () => {
  const markup = render({
    spec: { schema: { properties: { name: { type: "string", title: "Name" }, amount: { type: "integer", title: "Amount" } } } },
    rows: [{ name: "Budget", amount: 3 }],
  });
  assert.match(markup, /class="fui-Table/);
  assert.match(markup, /class="fui-Input/);
  assert.match(markup, /type="number"[^>]*step="any"|step="any"[^>]*type="number"/);
  assert.match(markup, /\+ Add row/);
  assert.match(markup, /aria-label="remove row 1"/);
  assert.doesNotMatch(markup, /style="display:(?:grid|flex)/);

  const restricted = render({
    spec: { addRow: false, deleteRow: false },
    rows: [{ name: "Budget" }],
  });
  assert.doesNotMatch(restricted, /\+ Add row/);
  assert.doesNotMatch(restricted, /remove row/);
});

test("editable table supports baseRows and primitive row values", () => {
  const markup = render({ baseRows: ["one", "two"] });
  assert.match(markup, />value<\/div><\/th>/i);
  assert.match(markup, /value="one"/);
  assert.match(markup, /value="two"/);
});

test("editable table definition exposes a closed authoring contract", () => {
  const trial = editableTableDefinition.materializeTrial();
  assert.equal(editableTableDefinition.validate(trial.props).ok, true);
  assert.equal(editableTableDefinition.validate({ ...trial.props, unknown: true }).ok, false);
  assert.deepEqual(editableTableDefinition.events, ["save"]);
  assert.equal(editableTableDefinition.describe().dataProp, "rows");
  assert.ok(editableTableDefinition.describe().authoring.rules.length > 0);
});
