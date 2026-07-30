import { test } from "vitest";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { Json } from "@gik/kernel";

import { FallbackView, buildRegistryFromImports, renderNode } from "@gik/react";
import { FLOOR_COMPONENTS, sortRows } from "./floorLeaves";

const registry = buildRegistryFromImports(
  { ui: { from: "floor" } },
  (from) => (from === "floor" ? FLOOR_COMPONENTS : undefined),
  FallbackView,
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
  return renderToStaticMarkup(renderNode(leaf("ui:table", props), registry, () => {}));
}

// --- pure sort helper -------------------------------------------------------------------------

test("sortRows orders numbers numerically, not lexically", () => {
  const rows = [{ n: 2 }, { n: 10 }, { n: 1 }];
  assert.deepEqual(sortRows(rows, "n", "asc").map((r) => r.n), [1, 2, 10]);
  assert.deepEqual(sortRows(rows, "n", "desc").map((r) => r.n), [10, 2, 1]);
});

test("sortRows orders strings and is direction-aware", () => {
  const rows = [{ s: "banana" }, { s: "apple" }, { s: "cherry" }];
  assert.deepEqual(sortRows(rows, "s", "asc").map((r) => r.s), ["apple", "banana", "cherry"]);
  assert.deepEqual(sortRows(rows, "s", "desc").map((r) => r.s), ["cherry", "banana", "apple"]);
});

test("sortRows always sorts null/undefined cells last, regardless of direction", () => {
  const rows = [{ v: 3 }, { v: null }, { v: 1 }];
  assert.deepEqual(sortRows(rows, "v", "asc").map((r) => r.v), [1, 3, null]);
  assert.deepEqual(sortRows(rows, "v", "desc").map((r) => r.v), [3, 1, null]);
});

test("sortRows is stable for equal keys", () => {
  const rows = [{ k: 1, tag: "a" }, { k: 1, tag: "b" }, { k: 1, tag: "c" }];
  assert.deepEqual(sortRows(rows, "k", "asc").map((r) => r.tag), ["a", "b", "c"]);
});

// --- render behaviour -------------------------------------------------------------------------

test("table infers columns from row objects when no columns spec is given", () => {
  const markup = render({ rows: [{ id: "r1", name: "Ada", role: "Eng" }] });
  assert.match(markup, /<th[^>]*>name<\/th>/);
  assert.match(markup, /<th[^>]*>role<\/th>/);
  // the id key is the row identity, not a display column
  assert.doesNotMatch(markup, /<th[^>]*>id<\/th>/);
  assert.match(markup, /Ada/);
});

test("sortable headers are the default and carry the button affordance", () => {
  const markup = render({ rows: [{ id: "r1", name: "Ada" }] });
  assert.match(markup, /class="gx-table-sortable"/);
  assert.match(markup, /role="button"/);
});

test("sortable can be disabled", () => {
  const markup = render({ rows: [{ id: "r1", name: "Ada" }], sortable: false });
  assert.doesNotMatch(markup, /gx-table-sortable/);
  assert.doesNotMatch(markup, /role="button"/);
});

test("table caps rows at maxRows and shows an overflow note", () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, n: i }));
  const markup = render({ rows, maxRows: 2 });
  assert.match(markup, /Showing 2 of 5 rows/);
  // only the first two rows' data cells are rendered
  assert.match(markup, />0</);
  assert.match(markup, />1</);
  assert.doesNotMatch(markup, />4</);
});

test("no overflow note when rows fit within the cap", () => {
  const markup = render({ rows: [{ id: "r1", n: 1 }], maxRows: 200 });
  assert.doesNotMatch(markup, /Showing \d+ of \d+ rows/);
});
