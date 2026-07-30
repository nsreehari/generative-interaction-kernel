import React from "react";
import assert from "node:assert/strict";
import { test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Json } from "@gik/kernel";
import type { ProjectionView, ProjectionViewProps } from "@gik/react";

import portfolioViews, { workflowPendingLabel } from "./portfolioTrackerLeaves";

function node(id: string, value: Json = null): ProjectionViewProps["node"] {
  return {
    id,
    capability: "portfolio:test",
    props: { value, title: "Portfolio tracker" },
    visible: true,
    fallback: false,
    children: [],
  };
}

function view(component: ProjectionView, id: string, value: Json = null): React.ReactElement {
  return React.createElement(component as React.ComponentType<ProjectionViewProps>, {
    node: node(id, value),
    emit: async () => undefined,
    children: null,
  });
}

test("portfolio workflow actions live in their result sections instead of the page header", () => {
  const Workspace = portfolioViews.workspace as React.ComponentType<ProjectionViewProps>;
  const markup = renderToStaticMarkup(
    <Workspace node={node("workspace")} emit={async () => undefined}>
      {view(portfolioViews.narrative, "portfolio-intelligence")}
      {view(portfolioViews["intelligence-projections"], "portfolio-intelligence-2", {})}
      {view(portfolioViews["intelligence-projections"], "portfolio-intelligence-1b", {})}
      {view(portfolioViews.comparison, "rebalance-comparison")}
    </Workspace>
  );

  assert.doesNotMatch(markup, /aria-label="Portfolio workflows"/);
  assert.match(markup, /Portfolio intelligence 1[\s\S]*Analyze portfolio/);
  assert.match(markup, /Portfolio intelligence 2[\s\S]*Analyze intelligence/);
  assert.match(markup, /Portfolio intelligence 1b[\s\S]*Analyze enhancement/);
  assert.match(markup, /Strategy comparison[\s\S]*Build strategies/);
  assert.equal((markup.match(/>Analy(?:ze portfolio|ze intelligence|ze enhancement)</g) ?? []).length, 3);
});

test("portfolio intelligence 2 renders semantic projection primitives instead of section titles only", () => {
  const intelligence = {
    headline: "Portfolio review",
    summary: "Review the concentration and valuation signals.",
    asOf: "2026-07-30",
    items: [
      { id: "risk", kind: "risk", title: "Concentration is elevated", detail: "One position drives most outcomes.", salience: "critical", confidence: "high", entities: ["NVDA"], value: "", unit: "", date: "", evidenceIds: [] },
      { id: "weight", kind: "metric", title: "Largest position", detail: "Current portfolio weight.", salience: "high", confidence: "high", entities: ["NVDA"], value: "55.4", unit: "percent", date: "", evidenceIds: [] },
    ],
    evidence: [],
    projectionCandidates: [{
      id: "scan",
      label: "Executive scan",
      attention: "glanceable",
      rationale: "Lead with the material risk.",
      sections: [
        { id: "lead", title: "What matters", primitive: "hero-signal", priority: "primary", disclosure: "always", contentIds: ["risk"] },
        { id: "metric", title: "Exposure", primitive: "metric-strip", priority: "secondary", disclosure: "always", contentIds: ["weight"] },
      ],
    }],
  };
  const Intelligence = portfolioViews["intelligence-projections"] as React.ComponentType<ProjectionViewProps>;
  const intelligenceNode = node("portfolio-intelligence-2", intelligence);
  intelligenceNode.props.presentationContext = "portfolio-overview";
  intelligenceNode.props.projectionRecipe = {
    contexts: { "portfolio-overview": { attention: "glanceable", showDisclosure: ["always"], maxSections: 3 } },
  };

  const markup = renderToStaticMarkup(<Intelligence node={intelligenceNode} emit={async () => undefined}>{null}</Intelligence>);

  assert.match(markup, /Concentration is elevated/);
  assert.match(markup, /One position drives most outcomes/);
  assert.match(markup, /Largest position/);
  assert.match(markup, /55\.4%/);
  assert.doesNotMatch(markup, /<li>Exposure<\/li>/);
});

test("portfolio intelligence 1b uses the analysis pending label", () => {
  assert.equal(workflowPendingLabel("requestIntelligence1b"), "Analyzing...");
});