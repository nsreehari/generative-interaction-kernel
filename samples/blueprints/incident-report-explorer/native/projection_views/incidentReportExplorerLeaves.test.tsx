import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import projectionViews, { analysisIsStale, IncidentProjectionsView, selectIncidentProjection } from "./incidentReportExplorerLeaves";

const value = {
  asOf: "2026-07-17 23:09:24",
  items: [
    { id: "verdict", kind: "judgment", title: "True Positive", detail: "Confirmed compromise", salience: "critical" },
    { id: "event", kind: "event", title: "Mailbox accessed", detail: "Items read", salience: "critical", date: "23:09:23" },
    { id: "action", kind: "action", title: "Contain identity exposure", detail: "Revoke sessions", salience: "critical" },
  ],
  projectionCandidates: [
    { id: "brief", label: "Command brief", attention: "glanceable", rationale: "Fast view", sections: [{ id: "hero", title: "What happened", primitive: "hero-signal", priority: "primary", disclosure: "always", contentIds: ["verdict"] }] },
    { id: "path", label: "Investigation path", attention: "focused", rationale: "Deep view", sections: [
      { id: "timeline", title: "Attack sequence", primitive: "timeline", priority: "primary", disclosure: "always", contentIds: ["event"] },
      { id: "actions", title: "Containment priorities", primitive: "action-list", priority: "secondary", disclosure: "collapsed", contentIds: ["action"] },
    ] },
  ],
};
const recipe = {
  fallback: { attention: "focused", showDisclosure: ["always", "collapsed"], maxSections: 8 },
};

describe("incident report projections", () => {
  it("exports unprefixed leaves for the incident provider alias", () => {
    expect(Object.keys(projectionViews)).toEqual(["workspace", "editor", "projections"]);
  });

  it("selects focused disclosure and detects stale source content", () => {
    expect(selectIncidentProjection(value, recipe).map((section) => section.id)).toEqual(["timeline", "actions"]);
    expect(analysisIsStale("new report", "old report")).toBe(true);
    expect(analysisIsStale("same report", "same report")).toBe(false);
  });

  it("renders agent output, progressive disclosure, and the current-state button", () => {
    const markup = renderToStaticMarkup(<IncidentProjectionsView node={{ id: "incident-intelligence", props: { value, content: "same report", analyzedContent: "same report", projectionRecipe: recipe } } as never} emit={async () => undefined} />);
    expect(markup).toMatch(/Analysis current/);
    expect(markup).toMatch(/disabled/);
    expect(markup).toMatch(/Attack sequence/);
    expect(markup).toMatch(/<details/);
    expect(markup).toMatch(/Containment priorities/);
  });
});