import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import {
  Timeline,
  materializeTimelineTrial,
  timelineDefinition,
  validateTimeline,
} from "../src/shared";

test("timeline definition describes its closed authoring contract", () => {
  assert.equal(timelineDefinition.capability, "semantic:timeline");
  assert.deepEqual(timelineDefinition.semanticTokens, ["past", "current", "upcoming", "blocked", "unknown"]);
  assert.equal(timelineDefinition.defaultVariant, "standard");
  assert.deepEqual(timelineDefinition.variants.map((variant) => variant.value), ["standard", "compact", "minimal"]);
  assert.equal(timelineDefinition.describe().dataProp, "items");
  assert.equal(timelineDefinition.component, Timeline);
});

test("timeline validator accepts mapped identities and rejects unknown semantic tokens", () => {
  const trial = materializeTimelineTrial();
  assert.equal(validateTimeline(trial.props).ok, true);

  const invalid = structuredClone(trial.props);
  const spec = invalid.spec as Record<string, unknown>;
  spec.toneMap = { active: "critical" };
  const report = validateTimeline(invalid);
  assert.equal(report.ok, false);
  assert.match(report.errors[0]?.detail ?? "", /toneMap/);
});

test("timeline validator rejects duplicate identities through the declared field mapping", () => {
  const trial = materializeTimelineTrial();
  const items = trial.props.items as Array<Record<string, unknown>>;
  items[1].eventKey = items[0].eventKey;
  const report = validateTimeline(trial.props);
  assert.equal(report.ok, false);
  assert.match(report.errors.map((issue) => issue.detail).join(" "), /identities must be unique/);
});

test("timeline trial materializes and renders through Fluent components", () => {
  const node = materializeTimelineTrial();
  const markup = renderToStaticMarkup(<Timeline node={node} emit={() => {}} children={undefined} />);

  assert.match(markup, /Investigation timeline/);
  assert.match(markup, /09:10/);
  assert.match(markup, /Signal detected/);
  assert.match(markup, /resolved/);
});