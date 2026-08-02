import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import type { Json, ResolvedNode } from "@gik/kernel";

import { Form, formDefinition } from "../src/form";

function node(props: Record<string, unknown>): ResolvedNode {
  return {
    id: "form-test",
    capability: "primitive:form",
    props: props as Record<string, Json>,
    visible: true,
    fallback: false,
    children: [],
  };
}

function render(props: Record<string, unknown>): string {
  return renderToStaticMarkup(<Form node={node(props)} emit={() => undefined} children={undefined} />);
}

test("form renders Fluent fields, constraints, hints, and grid spans", () => {
  const markup = render({
    fields: {
      properties: {
        code: { type: "string", title: "Code", description: "Uppercase code", pattern: "[A-Z]+", minLength: 2, maxLength: 6, colSpan: 4 },
        count: { type: "integer", title: "Count", minimum: 0, maximum: 10 },
        notes: { type: "string", title: "Notes", multiline: true, rows: 5 },
      },
      required: ["code"],
    },
    value: { code: "AB", count: 2, notes: "Ready" },
  });

  assert.match(markup, /class="[^"]*gx-form-grid/);
  assert.match(markup, /class="[^"]*gx-col-span-4/);
  assert.match(markup, /class="[^"]*gx-col-span-6/);
  assert.match(markup, /class="[^"]*gx-col-span-12/);
  assert.match(markup, /class="fui-Input/);
  assert.match(markup, /class="fui-Textarea/);
  assert.match(markup, /Uppercase code/);
  assert.match(markup, /pattern="\[A-Z\]\+"/);
  assert.match(markup, /minlength="2"/i);
  assert.match(markup, /maxlength="6"/i);
  assert.match(markup, /min="0"[^>]*max="10"|max="10"[^>]*min="0"/);
  assert.match(markup, /step="1"/);
});

test("form resolves enum, oneOf, multiselect, boolean, temporal, and JSON fields", () => {
  const markup = render({
    fields: {
      properties: {
        tier: { type: "string", title: "Tier", enum: ["a", "b"], enumNames: ["Alpha", "Beta"] },
        kind: { type: "string", title: "Kind", oneOf: [{ const: "x", title: "Ex" }] },
        tags: { type: "array", title: "Tags", items: { enum: ["one", "two"] } },
        active: { type: "boolean", title: "Active" },
        date: { type: "string", title: "Date", format: "date" },
        payload: { type: "json", title: "Payload" },
      },
    },
    value: {
      tier: "b",
      kind: "x",
      tags: ["two"],
      active: true,
      date: "2026-08-02T10:30:00Z",
      payload: { ok: true },
    },
  });

  assert.equal((markup.match(/role="combobox"/g) ?? []).length, 3);
  assert.match(markup, /Beta/);
  assert.match(markup, />Ex</);
  assert.match(markup, /class="fui-Checkbox/);
  assert.match(markup, /type="date"/);
  assert.match(markup, /value="2026-08-02"/);
  assert.match(markup, /&quot;ok&quot;: true/);
});

test("form accepts schema and data aliases and honors read-only fields", () => {
  const markup = render({
    schema: { properties: { locked: { type: "string", title: "Locked", readOnly: true } } },
    data: { locked: "fixed" },
  });

  assert.match(markup, /value="fixed"/);
  assert.match(markup, /readonly/i);
});

test("form definition exposes a closed authoring contract", () => {
  const trial = formDefinition.materializeTrial();
  assert.equal(formDefinition.validate(trial.props).ok, true);
  assert.equal(formDefinition.validate({ ...trial.props, unknown: true }).ok, false);
  assert.deepEqual(formDefinition.events, ["save"]);
  assert.equal(formDefinition.describe().dataProp, "value");
  assert.ok(formDefinition.describe().authoring.rules.length > 0);
});
