import { test } from "vitest";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
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

function renderForm(properties: Record<string, unknown>, value: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(renderNode(leaf("ui:form", {
    fields: { properties },
    value,
  }), registry, () => {}));
}

test("form renders per-field helper text from description/hint", () => {
  const markup = renderForm({
    name: { type: "string", title: "Name", description: "Your full name" },
    role: { type: "string", hint: "Team role" },
  });
  assert.match(markup, /class="gx-field-hint">Your full name/);
  assert.match(markup, /class="gx-field-hint">Team role/);
});

test("form honors readOnly / disabled on inputs", () => {
  const markup = renderForm({ locked: { type: "string", title: "Locked", readOnly: true } }, { locked: "x" });
  assert.match(markup, /readonly/i);
});

test("form applies text constraints (pattern, minLength, maxLength)", () => {
  const markup = renderForm({
    code: { type: "string", title: "Code", pattern: "[A-Z]+", minLength: 2, maxLength: 6 },
  });
  assert.match(markup, /pattern="\[A-Z\]\+"/);
  assert.match(markup, /minlength="2"/i);
  assert.match(markup, /maxlength="6"/i);
});

test("form applies numeric min/max/step by type", () => {
  const markup = renderForm({
    count: { type: "integer", title: "Count", minimum: 0, maximum: 10 },
    ratio: { type: "number", title: "Ratio" },
  });
  assert.match(markup, /min="0"[^>]*max="10"|max="10"[^>]*min="0"/);
  assert.match(markup, /step="1"/);
  assert.match(markup, /step="any"/);
});

test("form places fields on a 12-column grid with explicit and default colSpan", () => {
  const markup = renderForm({
    wide: { type: "string", title: "Wide", colSpan: 4 },
    amount: { type: "number", title: "Amount" }, // compact -> default span 6
    notes: { type: "string", title: "Notes" }, // text -> default span 12
  });
  assert.match(markup, /class="gx-form-grid"/);
  assert.match(markup, /gx-col-span-4/);
  assert.match(markup, /gx-col-span-6/);
  assert.match(markup, /gx-col-span-12/);
});

test("form resolves select options from enum + enumNames", () => {
  const markup = renderForm({
    tier: { type: "string", title: "Tier", enum: ["a", "b"], enumNames: ["Alpha", "Beta"] },
  }, { tier: "a" });
  assert.match(markup, /<option value="a"[^>]*>Alpha<\/option>/);
  assert.match(markup, /<option value="b"[^>]*>Beta<\/option>/);
});

test("form resolves select options from oneOf const/title", () => {
  const markup = renderForm({
    kind: { type: "string", title: "Kind", oneOf: [{ const: "x", title: "Ex" }, { const: "y", title: "Why" }] },
  });
  assert.match(markup, /<option value="x">Ex<\/option>/);
  assert.match(markup, /<option value="y">Why<\/option>/);
});

test("form disables a select when the field is readOnly", () => {
  const markup = renderForm({
    tier: { type: "string", title: "Tier", enum: ["a", "b"], readOnly: true },
  }, { tier: "a" });
  assert.match(markup, /<select[^>]*disabled/);
});
