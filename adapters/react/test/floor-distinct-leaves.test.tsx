import { test } from "vitest";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import type { Json } from "../../../kernel/src/types";

import { renderNode } from "../src/render";
import { buildRegistryFromImports } from "../src/registry";
import { FLOOR_COMPONENTS, floorFallback } from "../src/primitives/registry";

const registry = buildRegistryFromImports(
  { ui: { from: "floor" } },
  (from) => from === "floor" ? FLOOR_COMPONENTS : undefined,
  floorFallback
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

test("markdown leaf renders markdown content", () => {
  const markup = renderToStaticMarkup(renderNode(leaf("ui:markdown", { value: "# Hello\n\nbody" }), registry, () => {}));
  assert.match(markup, /<h1>Hello<\/h1>/);
  assert.match(markup, /<p>body<\/p>/);
});

test("chart leaf renders an svg chart with axis labels", () => {
  const markup = renderToStaticMarkup(renderNode(leaf("ui:chart", {
    chartType: "bar",
    columns: ["month", "sales"],
    data: [
      { month: "Jan", sales: 3 },
      { month: "Feb", sales: 5 },
    ],
  }), registry, () => {}));

  assert.match(markup, /<svg/);
  assert.match(markup, />Jan<\/text>/);
  assert.match(markup, />Feb<\/text>/);
});

test("todo leaf emits committed items on add", () => {
  const calls: Array<{ nodeId: string; name: string; payload?: Record<string, unknown> }> = [];
  const markup = renderToStaticMarkup(renderNode(leaf("ui:todo", {
    items: [{ text: "Ship slice", done: false }],
    actionLabel: "Add",
  }), registry, (nodeId, name, payload) => calls.push({ nodeId, name, payload })));

  assert.match(markup, /Ship slice/);
  assert.match(markup, />Add<\/button>/);
});

test("editableTable leaf renders headers and save affordance shell", () => {
  const markup = renderToStaticMarkup(renderNode(leaf("ui:editableTable", {
    spec: { columns: ["name", "amount"] },
    rows: [{ name: "Budget", amount: 3 }],
  }), registry, () => {}));

  assert.match(markup, /<th>name<\/th>/i);
  assert.match(markup, /<th>amount<\/th>/i);
  assert.match(markup, /\+ Add row/);
  assert.match(markup, /value="Budget"/);
});

test("multiFileUpload leaf renders grouped files and upload affordance", () => {
  const markup = renderToStaticMarkup(renderNode(leaf("ui:multiFileUpload", {
    submitLabel: "Upload",
    data: {
      files: [{ name: "brief.txt", size: 1280 }],
      filegroups: [{ message: "Context", file_idxs: [0] }],
    },
  }), registry, () => {}));

  assert.match(markup, /Context/);
  assert.match(markup, /brief.txt/);
  assert.match(markup, />Upload<\/button>/);
});

test("selection leaf emits select {value}", () => {
  const calls: Array<{ name: string; payload?: Record<string, unknown> }> = [];
  const View = FLOOR_COMPONENTS.selection as (props: {
    node: ReturnType<typeof leaf>;
    emit: (name: string, payload?: Record<string, unknown>) => void;
    children: null;
  }) => ReactElement<{ children: ReactElement[] }>;
  const element = View({
    node: leaf("ui:selection", {
      fields: { properties: { status: { title: "Status", enum: ["open", "closed"] } } },
      value: "open",
    }),
    emit: (name, payload) => calls.push({ name, payload }),
    children: null,
  }) as ReactElement<{ children: ReactElement[] }>;

  const select = element.props.children[1] as ReactElement<{ onChange: (event: { target: { value: string } }) => void }>;
  select.props.onChange({ target: { value: "closed" } });

  assert.deepEqual(calls, [{ name: "select", payload: { value: "closed" } }]);
});

test("query/searchbox alias renders the committed search leaf", () => {
  const markup = renderToStaticMarkup(renderNode(leaf("ui:query", {
    fields: { properties: { limit: { title: "Limit", type: "number" } } },
    value: "42",
    actionLabel: "Run",
  }), registry, () => {}));

  assert.match(markup, /type="number"/);
  assert.match(markup, />Run<\/button>/);
});