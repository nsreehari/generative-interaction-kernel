import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import {
  EventSeries,
  eventSeriesDefinition,
  materializeEventSeriesTrial,
} from "../src/shared";

test("event series definition describes its closed authoring contract", () => {
  assert.equal(eventSeriesDefinition.capability, "semantic:event-series");
  assert.deepEqual(eventSeriesDefinition.semanticTokens, ["past", "current", "upcoming", "blocked", "unknown"]);
  assert.equal(eventSeriesDefinition.defaultVariant, "chronology");
  assert.deepEqual(eventSeriesDefinition.variants.map((variant) => variant.value), ["chronology", "axis", "text"]);
  assert.equal(eventSeriesDefinition.describe().dataProp, "items");
  assert.equal(eventSeriesDefinition.component, EventSeries);
});

test("event series validator accepts mapped identities and rejects unknown semantic tokens", () => {
  const trial = materializeEventSeriesTrial();
  assert.equal(eventSeriesDefinition.validate(trial.props).ok, true);

  const invalid = structuredClone(trial.props);
  const spec = invalid.spec as Record<string, unknown>;
  spec.toneMap = { active: "critical" };
  const report = eventSeriesDefinition.validate(invalid);
  assert.equal(report.ok, false);
  assert.match(report.errors[0]?.detail ?? "", /toneMap/);
});

test("event series validator rejects duplicate identities through the declared field mapping", () => {
  const trial = materializeEventSeriesTrial();
  const items = trial.props.items as Array<Record<string, unknown>>;
  items[1].eventKey = items[0].eventKey;
  const report = eventSeriesDefinition.validate(trial.props);
  assert.equal(report.ok, false);
  assert.match(report.errors.map((issue) => issue.detail).join(" "), /identities must be unique/);
});

test("event series trial materializes and renders through Fluent components", () => {
  const node = materializeEventSeriesTrial();
  const markup = renderToStaticMarkup(<EventSeries node={node} emit={() => {}} children={undefined} />);

  assert.match(markup, /Investigation timeline/);
  assert.match(markup, /09:10/);
  assert.match(markup, /Signal detected/);
  assert.match(markup, /resolved/);
});

test("axis event series renders datetime and fractional linear event markers", () => {
  const datetime = materializeEventSeriesTrial();
  datetime.props.variant = "axis";
  datetime.props.items = [{ eventKey: "a", at: "2026-08-04T09:10:00Z", title: "Signal detected" }, { eventKey: "b", at: "2026-08-04T09:24:00Z", title: "Investigation opened" }];
  const datetimeSpec = datetime.props.spec as Record<string, unknown>;
  datetimeSpec.scale = { kind: "datetime", tickStep: 420000 };
  assert.equal(eventSeriesDefinition.validate(datetime.props).ok, true);
  const datetimeMarkup = renderToStaticMarkup(<EventSeries node={datetime} emit={() => {}} children={undefined} />);
  assert.match(datetimeMarkup, /aria-label="Investigation timeline"/);
  assert.match(datetimeMarkup, /Signal detected/);
  assert.doesNotMatch(datetimeMarkup, />2026-08-04T09:10:00Z</);

  const linear = structuredClone(datetime);
  linear.props.items = [{ eventKey: "a", at: 1, title: "Signal detected" }, { eventKey: "b", at: 1.5, title: "Investigation opened" }];
  (linear.props.spec as Record<string, unknown>).scale = { kind: "linear", minimum: 0, maximum: 2, tickStep: 0.5, displayPrefix: "T" };
  assert.equal(eventSeriesDefinition.validate(linear.props).ok, true);
  const linearMarkup = renderToStaticMarkup(<EventSeries node={linear} emit={() => {}} children={undefined} />);
  assert.match(linearMarkup, /T1\.5/);
  assert.match(linearMarkup, /left:75%/);
});