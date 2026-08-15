import React from "react";
import assert from "node:assert/strict";
import { test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Json } from "@gik/kernel";
import type { ProjectionViewProps } from "@gik/react";

import portfolioViews, { formatIntelligenceMetric, safeEvidenceUrl } from "./portfolioTrackerLeaves";

function node(value: Json = null): ProjectionViewProps["node"] {
  return { id: "portfolio-intelligence", capability: "portfolio:intelligence-projections", props: { value }, visible: true, fallback: false, children: [] };
}

test("portfolio intelligence renders semantic projection primitives", () => {
  const intelligence = {
    headline: "Portfolio review", summary: "Review the concentration and valuation signals.", asOf: "2026-07-30",
    items: [
      { id: "risk", kind: "risk", title: "Concentration is elevated", detail: "One position drives most outcomes.", salience: "critical", confidence: "high", entities: ["NVDA"], value: "", unit: "", date: "", evidenceIds: [] },
      { id: "weight", kind: "metric", title: "Largest position", detail: "Current portfolio weight.", salience: "high", confidence: "high", entities: ["NVDA"], value: "55.4", unit: "percent", date: "", evidenceIds: [] },
    ],
    evidence: [],
    projectionCandidates: [{ id: "scan", label: "Executive scan", attention: "glanceable", rationale: "Lead with the material risk.", sections: [
      { id: "lead", title: "What matters", primitive: "hero-signal", priority: "primary", disclosure: "always", contentIds: ["risk"] },
      { id: "metric", title: "Exposure", primitive: "metric-strip", priority: "secondary", disclosure: "always", contentIds: ["weight"] },
    ] }],
  };
  const intelligenceNode = node(intelligence);
  intelligenceNode.props.presentationContext = "portfolio-overview";
  intelligenceNode.props.projectionRecipe = { contexts: { "portfolio-overview": { attention: "glanceable", showDisclosure: ["always"], maxSections: 3 } } };
  const Intelligence = portfolioViews["intelligence-projections"];
  const markup = renderToStaticMarkup(<Intelligence node={intelligenceNode} emit={async () => undefined}>{null}</Intelligence>);

  assert.match(markup, /Concentration is elevated/);
  assert.match(markup, /One position drives most outcomes/);
  assert.match(markup, /Largest position/);
  assert.match(markup, /55\.4%/);
});

test("portfolio intelligence renders source settlement state without imperative workflow actions", () => {
  const Intelligence = portfolioViews["intelligence-projections"];
  const markup = renderToStaticMarkup(<Intelligence node={node({})} emit={async () => undefined}>{null}</Intelligence>);
  assert.match(markup, /Analysis pending/);
  assert.doesNotMatch(markup, /button|Analyze|Refresh/);
});

test("portfolio intelligence formats metrics and rejects unsafe evidence URLs", () => {
  assert.equal(formatIntelligenceMetric("62235.2", "USD"), "$62,235.20");
  assert.equal(formatIntelligenceMetric("125.5", "percent"), "125.5%");
  assert.equal(formatIntelligenceMetric("100", "shares"), "100 shares");
  assert.equal(safeEvidenceUrl("https://investor.nvidia.com/events"), "https://investor.nvidia.com/events");
  assert.equal(safeEvidenceUrl("javascript:alert(1)"), undefined);
});