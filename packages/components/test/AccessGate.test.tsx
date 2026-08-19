import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { AccessGate, accessGateDefinition } from "../src/primitives";

test("primitive:access-gate exposes a closed access data contract", () => {
  assert.equal(accessGateDefinition.dataProp, "access");
  assert.deepEqual(accessGateDefinition.events, ["submit", "retry", "reset", "dismiss"]);
  assert.equal(accessGateDefinition.validate({ access: { triggered: false } }).ok, true);
  assert.equal(accessGateDefinition.validate({ access: { triggered: "yes" } }).ok, false);
});

test("primitive:access-gate renders protected children when not triggered", () => {
  const trial = accessGateDefinition.materializeTrial();
  trial.props.access = { triggered: false };
  const Component = accessGateDefinition.component;
  const markup = renderToStaticMarkup(
    <Component node={trial} emit={() => undefined} children={<p>Protected content</p>} />,
  );

  assert.match(markup, /Protected content/);
  assert.doesNotMatch(markup, /Connect to service/);
});

test("primitive:access-gate forwards root overrides to its dialog surface", () => {
  const trial = accessGateDefinition.materializeTrial();
  trial.props.className = "callsite-override";
  trial.props.style = { maxWidth: "40rem" };

  const dialog = AccessGate({
    node: trial,
    emit: () => undefined,
    children: <p>Protected content</p>,
  }) as React.ReactElement<{ node: { props: Record<string, unknown> } }>;

  assert.equal(dialog.props.node.props.className, "callsite-override");
  assert.deepEqual(dialog.props.node.props.style, { maxWidth: "40rem" });
  assert.equal(dialog.props.node.props.defaultOpen, true);
  assert.equal(dialog.props.node.props.open, undefined);
});