import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { createGikComponentDeclarativeBundle } from "../src/GikComponentDeclarative";
import {
  semanticComponentCapabilities,
  semanticComponentDefinitions,
  semanticComponentViews,
} from "../src/semantic/registry";

const canonical = [
  "argument", "event-series", "process", "work-set", "entity-set", "evidence-case", "decision",
] as const;

test("canonical semantic definitions validate and render every declared variant", () => {
  for (const name of canonical) {
    const definition = semanticComponentDefinitions[name];
    for (const variant of definition.variants.map((entry) => entry.value)) {
      const trial = definition.materializeTrial();
      trial.props.variant = variant;
      assert.equal(definition.validate(trial.props).ok, true, `${definition.capability}:${variant}`);
      assert.ok(renderToStaticMarkup(<definition.component node={trial} emit={() => {}} children={undefined} />).length > 0);
    }

    const defaultTrial = definition.materializeTrial();
    delete defaultTrial.props.variant;
    assert.equal(definition.validate(defaultTrial.props).ok, true, `${definition.capability}:default`);
    assert.ok(renderToStaticMarkup(<definition.component node={defaultTrial} emit={() => {}} children={undefined} />).length > 0);
  }
});

test("canonical semantics are registered with capabilities and recognized by declarative bundles", () => {
  for (const name of canonical) {
    assert.equal(semanticComponentViews[name], semanticComponentDefinitions[name].component);
    assert.ok(semanticComponentCapabilities[name].propsSchema);
    const trial = semanticComponentDefinitions[name].materializeTrial();
    const bundle = createGikComponentDeclarativeBundle({ id: trial.id, capability: trial.capability, props: trial.props });
    const vocabulary = "payload" in bundle.vocabulary ? bundle.vocabulary.payload : bundle.vocabulary;
    assert.ok(vocabulary.capabilities[`semantic:${name}`]?.propsSchema);
  }
});

test("canonical configuration keeps density under closed spec and rejects context", () => {
  for (const name of canonical) {
    const definition = semanticComponentDefinitions[name];
    const trial = definition.materializeTrial();
    assert.equal((trial.props.spec as Record<string, unknown>).density, "comfortable");
    assert.equal(definition.validate({ ...trial.props, context: { density: "compact" } }).ok, false, definition.capability);
  }
});

test("superseded semantic IDs are absent from the public registry", () => {
  for (const name of ["timeline", "sequence", "action-board", "entity-constellation", "attack-graph", "evidence-trail", "decision-summary", "annotated-source-excerpt"]) {
    assert.equal(name in semanticComponentDefinitions, false, name);
  }
});