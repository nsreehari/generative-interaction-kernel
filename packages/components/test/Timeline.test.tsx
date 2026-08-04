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
  assert.deepEqual(timelineDefinition.variants.map((variant) => variant.value), ["standard", "compact", "minimal", "axis"]);
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

test("axis timeline renders datetime and fractional linear event markers", () => {
  const datetime = materializeTimelineTrial();
  datetime.props.variant = "axis";
  datetime.props.items = [{ eventKey: "a", at: "2026-08-04T09:10:00Z", title: "Signal detected" }, { eventKey: "b", at: "2026-08-04T09:24:00Z", title: "Investigation opened" }];
  const datetimeSpec = datetime.props.spec as Record<string, unknown>;
  datetimeSpec.scale = { kind: "datetime", tickStep: 420000 };
  assert.equal(validateTimeline(datetime.props).ok, true);
  const datetimeMarkup = renderToStaticMarkup(<Timeline node={datetime} emit={() => {}} children={undefined} />);
  assert.match(datetimeMarkup, /aria-label="Investigation timeline"/);
  assert.match(datetimeMarkup, /Signal detected/);
  assert.doesNotMatch(datetimeMarkup, />2026-08-04T09:10:00Z</);

  const linear = structuredClone(datetime);
  linear.props.items = [{ eventKey: "a", at: 1, title: "Signal detected" }, { eventKey: "b", at: 1.5, title: "Investigation opened" }];
  (linear.props.spec as Record<string, unknown>).scale = { kind: "linear", minimum: 0, maximum: 2, tickStep: 0.5, displayPrefix: "T" };
  assert.equal(validateTimeline(linear.props).ok, true);
  const linearMarkup = renderToStaticMarkup(<Timeline node={linear} emit={() => {}} children={undefined} />);
  assert.match(linearMarkup, /T1\.5/);
  assert.match(linearMarkup, /left:75%/);
});