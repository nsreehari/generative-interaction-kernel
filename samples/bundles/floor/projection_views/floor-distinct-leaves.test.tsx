import { test } from "vitest";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import type { Json } from "@gik/kernel";

import { FallbackView, buildRegistryFromImports, renderNode, type ProjectionViewProps } from "@gik/react";
import { FLOOR_COMPONENTS } from "./index";

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

test("markdown leaf renders markdown content", () => {
  const markup = renderToStaticMarkup(renderNode(leaf("ui:markdown", { value: "# Hello\n\nbody" }), registry, () => {}));
  assert.match(markup, /<h1>Hello<\/h1>/);
  assert.match(markup, /<p>body<\/p>/);
});

test("alert leaf renders the value, label, and severity badge", () => {
  const markup = renderToStaticMarkup(renderNode(leaf("ui:alert", {
    value: 7,
    label: "Blocked checks",
    level: "amber",
  }), registry, () => {}));

  assert.match(markup, /Blocked checks/);
  assert.match(markup, />7</);
  assert.match(markup, /amber/);
});

test("narrative leaf renders empty placeholder when text is blank", () => {
  const markup = renderToStaticMarkup(renderNode(leaf("ui:narrative", {
    text: "",
    emptyMessage: "Nothing to explain.",
  }), registry, () => {}));

  assert.match(markup, /Nothing to explain\./);
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
  }), registry, (nodeId, name, payload) => {
    calls.push({ nodeId, name, payload });
  }));

  assert.match(markup, /Ship slice/);
  assert.match(markup, />Add<\/button>/);
});

test("actions leaf renders button row labels", () => {
  const markup = renderToStaticMarkup(renderNode(leaf("ui:actions", {
    buttons: [
      { id: "approve", label: "Approve", tone: "primary" },
      { id: "reject", label: "Reject", tone: "danger" },
    ],
  }), registry, () => {}));

  assert.match(markup, />Approve<\/button>/);
  assert.match(markup, />Reject<\/button>/);
});

test("timer-button leaf renders its initial countdown", () => {
  const markup = renderToStaticMarkup(renderNode(leaf("ui:timer-button", {
    label: "Auto next",
    durationMs: 300000,
  }), registry, () => {}));

  assert.match(markup, /aria-label="Auto next, 300 seconds remaining"/);
  assert.match(markup, /class="gx-timer-label">Auto next<\/span>/);
  assert.match(markup, /class="gx-timer-count">5:00<\/span>/);
});

test("math-challenge leaf renders an accessible deterministic confirmation gate", () => {
  const markup = renderToStaticMarkup(renderNode(leaf("ui:math-challenge", {
    message: "Delete local blueprint 'draft-one'?",
    operandA: 4,
    operandB: 5,
  }), registry, () => {}));

  assert.match(markup, /role="alertdialog"/);
  assert.match(markup, /Delete local blueprint &#x27;draft-one&#x27;\?/);
  assert.match(markup, /4 \+ 5 = \?/);
  assert.match(markup, /type="submit" disabled=""/);
});

test("form leaf renders schema-driven fields and save shell", () => {
  const markup = renderToStaticMarkup(renderNode(leaf("ui:form", {
    fields: {
      properties: {
        status: { title: "Status", enum: ["open", "closed"] },
        notes: { title: "Notes", format: "textarea" },
      },
      required: ["status"],
    },
    value: { status: "open", notes: "hello" },
  }), registry, () => {}));

  assert.match(markup, /Status/);
  assert.match(markup, /Notes/);
  assert.match(markup, /textarea/);
});

test("notes leaf renders textarea shell", () => {
  const markup = renderToStaticMarkup(renderNode(leaf("ui:notes", {
    content: "Draft note",
    placeholder: "Write markdown...",
  }), registry, () => {}));

  assert.match(markup, /textarea/);
  assert.match(markup, /Draft note/);
});

test("editable-table leaf renders headers and save affordance shell", () => {
  const markup = renderToStaticMarkup(renderNode(leaf("ui:editable-table", {
    spec: { columns: ["name", "amount"] },
    rows: [{ name: "Budget", amount: 3 }],
  }), registry, () => {}));

  assert.match(markup, /<th>name<\/th>/i);
  assert.match(markup, /<th>amount<\/th>/i);
  assert.match(markup, /\+ Add row/);
  assert.match(markup, /value="Budget"/);
});

test("multi-file-upload leaf renders grouped files and upload affordance", () => {
  const markup = renderToStaticMarkup(renderNode(leaf("ui:multi-file-upload", {
    submitLabel: "Upload",
    data: {
      files: [{ name: "brief.txt", size: 1280 }],
      filegroups: [{ message: "Context", file_idxs: [0] }],
    },
  }), registry, () => {}));

  assert.match(markup, /brief.txt/);
  assert.match(markup, /Context/);
  assert.match(markup, />Upload<\/button>/);
});

test("selection leaf emits select {value}", () => {
  const calls: Array<{ name: string; payload?: Record<string, unknown> }> = [];
  const SelectionView = FLOOR_COMPONENTS.selection as (props: ProjectionViewProps) => ReactElement<{ children: ReactElement[] }>;
  const element = SelectionView({
    node: leaf("ui:selection", {
      fields: {
        properties: {
          status: { title: "Status", enum: ["open", "closed"] },
        },
        required: ["status"],
      },
      value: "open",
    }),
    emit: (name: string, payload?: Record<string, unknown>) => {
      calls.push({ name, payload });
    },
    children: [],
  });

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