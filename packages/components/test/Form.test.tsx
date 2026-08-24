import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer, { act } from "react-test-renderer";
import { test } from "vitest";

import type { Json, ResolvedNode } from "@gik/kernel";

import { Form, formDefinition } from "../src/primitives/form";

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

test("form can expose an unsaved initial draft", () => {
  const markup = render({
    fields: { properties: { name: { type: "string", title: "Name" } } },
    value: { name: "Draft" },
    initiallyDirty: true,
  });

  assert.match(markup, />Discard</);
  assert.match(markup, />Save</);
});

test("form-wide readOnly makes all fields inspect-only and suppresses commit actions", () => {
  const markup = render({
    fields: {
      properties: {
        name: { type: "string", title: "Name" },
        payload: { type: "json", title: "Payload" },
        active: { type: "boolean", title: "Active" },
      },
    },
    value: { name: "Built-in", payload: { id: "built-in" }, active: true },
    initiallyDirty: true,
    readOnly: true,
  });

  assert.equal((markup.match(/readonly/g) ?? []).length, 2);
  assert.match(markup, /disabled/);
  assert.doesNotMatch(markup, />Discard</);
  assert.doesNotMatch(markup, />Save</);
});

test("form routes keyed fields through generic layout slots", () => {
  const markup = render({
    fields: {
      properties: {
        title: { type: "string", title: "Title" },
        severity: { type: "string", title: "Severity" },
        description: { type: "string", title: "Description" },
      },
    },
    layout: {
      slots: [
        { key: "title", slot: "primary" },
        { key: "description", slot: "primary" },
        { key: "severity", slot: "secondary" },
      ],
    },
  });

  assert.match(markup, /data-layout-slot="primary"/);
  assert.match(markup, /data-layout-slot="secondary"/);
  assert.ok(markup.indexOf("Title") < markup.indexOf("Description"));
  assert.ok(markup.indexOf("Description") < markup.indexOf("Severity"));
});

test("form definition exposes a closed authoring contract", () => {
  const trial = formDefinition.materializeTrial();
  assert.equal(formDefinition.validate(trial.props).ok, true);
  assert.equal(formDefinition.validate({ ...trial.props, validationContext: { catalog: { ids: ["existing"] } } }).ok, true);
  assert.equal(formDefinition.validate({ ...trial.props, unknown: true }).ok, false);
  assert.deepEqual(formDefinition.events, ["save"]);
  assert.equal(formDefinition.describe().dataProp, "value");
  assert.ok(formDefinition.describe().authoring.rules.length > 0);
});

test("form shows a local success confirmation in place of the action row after a save, until the next edit", async () => {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(
      <Form
        node={node({
          fields: { properties: { name: { type: "string", title: "Name" } } },
          value: { name: "Draft" },
          initiallyDirty: true,
          successLabel: "All set",
        })}
        emit={() => undefined}
      >
        {null}
      </Form>,
    );
  });
  const form = renderer!.root.findByType("form");

  // Before any save: the action row shows, no success confirmation yet.
  assert.ok(renderer!.root.findByProps({ children: "Save" }));
  assert.throws(() => renderer!.root.findByProps({ children: "All set" }));

  await act(async () => {
    form.props.onSubmit({ preventDefault: () => undefined });
  });

  // After a successful save with no further edits: success confirmation replaces the action row.
  assert.ok(renderer!.root.findByProps({ children: "All set" }));
  assert.throws(() => renderer!.root.findByProps({ children: "Save" }));
  assert.throws(() => renderer!.root.findByProps({ children: "Discard" }));

  // Editing again clears the confirmation and brings the action row back.
  const nameInput = renderer!.root.findByProps({ type: "text" });
  await act(async () => {
    nameInput.props.onChange(undefined, { value: "Draft 2" });
  });
  assert.ok(renderer!.root.findByProps({ children: "Save" }));
  assert.throws(() => renderer!.root.findByProps({ children: "All set" }));

  await act(async () => renderer!.unmount());
});

test("a tracked save shows a spinner while saving, then success once the host reports it settled", async () => {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  const baseProps = {
    fields: { properties: { name: { type: "string", title: "Name" } } },
    value: { name: "Draft" },
    initiallyDirty: true,
    saving: false,
    saveError: "",
  };
  await act(async () => {
    renderer = TestRenderer.create(
      <Form node={node(baseProps)} emit={() => undefined}>{null}</Form>,
    );
  });
  const form = () => renderer!.root.findByType("form");

  await act(async () => {
    form().props.onSubmit({ preventDefault: () => undefined });
  });
  // The optimistic success path is disabled for a tracked Form: still showing actions, not "Saved".
  assert.ok(renderer!.root.findByProps({ children: "Save" }));
  assert.throws(() => renderer!.root.findByProps({ children: "Saved" }));

  // The host's own `assign` reports the save as running: the Save button becomes a spinner state.
  await act(async () => {
    renderer!.update(<Form node={node({ ...baseProps, saving: true })} emit={() => undefined}>{null}</Form>);
  });
  assert.ok(renderer!.root.findByProps({ children: "Saving…" }));
  assert.throws(() => renderer!.root.findByProps({ children: "Save" }));

  // The host's settlement transform reports success (saving back to false, no error): success
  // confirmation replaces the action row.
  await act(async () => {
    renderer!.update(<Form node={node({ ...baseProps, saving: false })} emit={() => undefined}>{null}</Form>);
  });
  assert.ok(renderer!.root.findByProps({ children: "Saved" }));
  assert.throws(() => renderer!.root.findByProps({ children: "Save" }));

  await act(async () => renderer!.unmount());
});

test("a tracked save that fails keeps the draft editable and shows the host's error", async () => {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  const baseProps = {
    fields: { properties: { name: { type: "string", title: "Name" } } },
    value: { name: "Draft" },
    initiallyDirty: true,
    saving: false,
    saveError: "",
  };
  await act(async () => {
    renderer = TestRenderer.create(
      <Form node={node(baseProps)} emit={() => undefined}>{null}</Form>,
    );
  });

  await act(async () => {
    renderer!.root.findByType("form").props.onSubmit({ preventDefault: () => undefined });
  });
  await act(async () => {
    renderer!.update(<Form node={node({ ...baseProps, saving: true })} emit={() => undefined}>{null}</Form>);
  });
  await act(async () => {
    renderer!.update(
      <Form node={node({ ...baseProps, saving: false, saveError: "Server unavailable" })} emit={() => undefined}>
        {null}
      </Form>,
    );
  });

  // Failure: no success confirmation, actions remain so the user can retry, and the error shows.
  assert.throws(() => renderer!.root.findByProps({ children: "Saved" }));
  assert.ok(renderer!.root.findByProps({ children: "Save" }));
  assert.ok(renderer!.root.findByProps({ children: "Discard" }));
  assert.ok(renderer!.root.findByProps({ children: "Server unavailable" }));

  await act(async () => renderer!.unmount());
});

