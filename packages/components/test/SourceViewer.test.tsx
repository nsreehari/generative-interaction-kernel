import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import {
  SourceViewer,
  materializeSourceViewerTrial,
  sourceViewerDefinition,
  validateSourceViewer,
} from "../src/primitives/source-viewer";

test("source viewer separates representation kind from density variant", () => {
  assert.deepEqual(sourceViewerDefinition.variants.map((variant) => variant.value), ["standard", "compact"]);
  const schema = sourceViewerDefinition.getSchema() as { properties: { spec: { properties: { kind: { enum: string[] } } } } };
  assert.deepEqual(schema.properties.spec.properties.kind.enum, ["source", "unified-diff", "split-diff"]);
});

test("source viewer validates representation-specific field mappings", () => {
  const trial = materializeSourceViewerTrial();
  assert.equal(validateSourceViewer(trial.props).ok, true);
  const invalid = structuredClone(trial.props);
  delete ((invalid.spec as Record<string, unknown>).fields as Record<string, unknown>).change;
  assert.equal(validateSourceViewer(invalid).ok, false);
});

test("source viewer renders split and unified precomputed diffs", () => {
  const split = materializeSourceViewerTrial();
  const splitMarkup = renderToStaticMarkup(<SourceViewer node={split} emit={() => undefined} children={undefined} />);
  assert.match(splitMarkup, /riskScore &gt; threshold/);
  assert.match(splitMarkup, /riskScore &gt;= threshold/);
  assert.match(splitMarkup, /Threshold is now inclusive/);

  const unified = structuredClone(split);
  (unified.props.spec as Record<string, unknown>).kind = "unified-diff";
  const unifiedMarkup = renderToStaticMarkup(<SourceViewer node={unified} emit={() => undefined} children={undefined} />);
  assert.match(unifiedMarkup, />~</);
  assert.match(unifiedMarkup, />\+</);
});

test("source viewer requires exact line mappings for source representation", () => {
  const source = materializeSourceViewerTrial();
  source.props.lines = [{ id: "1", line: 1, text: "const enabled = true;" }];
  source.props.spec = { kind: "source", fields: { id: "id", number: "line", text: "text" } };
  assert.equal(validateSourceViewer(source.props).ok, true);
  const markup = renderToStaticMarkup(<SourceViewer node={source} emit={() => undefined} children={undefined} />);
  assert.match(markup, /const enabled = true;/);
});
