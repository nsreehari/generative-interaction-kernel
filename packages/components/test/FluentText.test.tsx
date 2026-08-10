import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { createGikComponentDeclarativeBundle } from "../src/GikComponentDeclarative";
import { fluentTextDefinition } from "../src/fluent/FluentText";

test("fluent:text separates HTML semantics from visual variants", () => {
  const Component = fluentTextDefinition.component;
  const heading = fluentTextDefinition.materializeTrial();
  const headingMarkup = renderToStaticMarkup(<Component node={heading} emit={() => undefined} children={undefined} />);
  assert.match(headingMarkup, /<h1/);
  assert.match(headingMarkup, /Incident report analysis workbench/);

  const label = fluentTextDefinition.materializeTrial();
  label.props = { value: "Source report", as: "label", htmlFor: "source-report", variant: "caption" };
  const labelMarkup = renderToStaticMarkup(<Component node={label} emit={() => undefined} children={undefined} />);
  assert.match(labelMarkup, /<label/);
  assert.match(labelMarkup, /for="source-report"/);

  for (const variant of ["body", "caption", "subtitle", "title", "display"]) {
    assert.equal(fluentTextDefinition.validate({ value: "Text", variant }).ok, true, variant);
  }
  assert.equal(fluentTextDefinition.validate({ value: "Text", variant: "heading" }).ok, false);
  assert.equal(fluentTextDefinition.validate({ value: "Text", as: "article" }).ok, false);
});

test("GikComponentDeclarative discovers fluent:text", () => {
  const bundle = createGikComponentDeclarativeBundle({
    id: "page-title",
    capability: "fluent:text",
    props: { value: "Workbench", as: "h1", variant: "title" },
  });
  const vocabulary = "payload" in bundle.vocabulary ? bundle.vocabulary.payload : bundle.vocabulary;
  assert.ok("fluent:text" in vocabulary.capabilities);
  assert.deepEqual(vocabulary.externals?.projectionViews, { fluent: { from: "fluent", use: ["text"] } });
});