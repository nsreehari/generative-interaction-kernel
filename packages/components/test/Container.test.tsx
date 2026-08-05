import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import { unwrap } from "@gik/kernel";

import {
  CONTAINER_VARIANTS,
  ContainerPrimitive,
  containerDefinition,
  createGikComponentDeclarativeBundle,
} from "../src/shared";

test("container variants preserve the same slotted children", () => {
  for (const variant of CONTAINER_VARIANTS) {
    const trial = containerDefinition.materializeTrial();
    trial.props.variant = variant;
    assert.equal(containerDefinition.validate(trial.props).ok, true);
    const markup = renderToStaticMarkup(<ContainerPrimitive node={trial} emit={() => {}}>Authored child</ContainerPrimitive>);
    assert.match(markup, new RegExp(`gik-container-${variant}`));
    assert.match(markup, /Authored child/);
  }
});

test("container has structural slots and no authored data kind", () => {
  assert.deepEqual(containerDefinition.slots, ["children"]);
  assert.equal(containerDefinition.dataProp, undefined);
  assert.equal(containerDefinition.defaultVariant, "column");
  assert.equal(containerDefinition.validate({ variant: "grid" }).ok, false);
  assert.equal(containerDefinition.validate({ variant: "row", gap: "huge" }).ok, false);
  assert.equal(containerDefinition.validate({ variant: "row", fullWidth: true, grow: false }).ok, true);
});

test("GikComponentDeclarative composes nested container children", () => {
  const bundle = createGikComponentDeclarativeBundle({
    id: "layout",
    capability: "primitive:container",
    props: { variant: "row", gap: "m" },
    edges: {
      children: [{ id: "nested", capability: "primitive:container", props: { variant: "column" } }],
    },
  });
  const vocabulary = unwrap(bundle.vocabulary);
  assert.deepEqual(vocabulary.externals?.projectionViews, { primitive: { from: "primitive", use: ["container"] } });
  assert.deepEqual(vocabulary.capabilities["primitive:container"].slots, ["children"]);
});