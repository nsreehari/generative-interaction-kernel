import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import leaves, { analysisIsStale } from "./incidentReportExplorer2Leaves";

const model = {
  identity: { incidentId: "inc-1", title: "Mailbox and identity compromise", startTime: "23:09:23", endTime: "23:09:24" },
  verdict: { classification: "True Positive", determination: "Other", confidence: "high", rationale: "Confirmed", impact: "Data accessed" },
  summary: "Password spraying led to mailbox access and managed identity exposure.",
  phases: [{ id: "phase-1", name: "Credential Access", order: 0, summary: "Credentials targeted and obtained." }],
  entities: [
    { id: "actor", type: "ip", label: "185.220.101.34", status: "observed", description: "Source", confidence: "high" },
    { id: "mailbox", type: "mailbox", label: "m.fischer@contoso.com", status: "compromised", description: "Mailbox accessed", confidence: "high" },
  ],
  relationships: [{ id: "edge-1", sourceId: "actor", targetId: "mailbox", kind: "accessed", label: "accessed mailbox", phaseId: "phase-1", evidenceIds: [] }],
  events: [{ id: "event-1", time: "23:09:23", title: "Mailbox accessed", detail: "Items read through Graph.", phaseId: "phase-1", entityIds: ["mailbox"], evidenceIds: [], confidence: "high" }],
  techniques: [{ id: "ttp-1", tactic: "Collection", technique: "Remote Email Collection", techniqueId: "T1114.002", description: "Mailbox items collected.", phaseId: "phase-1", evidenceIds: [], confidence: "high" }],
  actions: [{ id: "action-1", priority: "immediate", category: "containment", title: "Revoke sessions", detail: "Reset credentials and revoke active sessions.", entityIds: ["mailbox"] }],
  representationNotes: [{ id: "note-1", category: "schema-gap", severity: "warning", sourceSection: "Entities", commentary: "Business ownership was not modeled.", suggestedVocabularyExtension: "entity.businessOwner" }],
};

function renderLeaf(name: keyof typeof leaves) {
  const Leaf = leaves[name];
  return renderToStaticMarkup(<Leaf node={{ id: name, props: { value: model } } as never} emit={async () => undefined} />);
}

describe("incident-report-explorer-2 leaves", () => {
  it("exports the closed authored leaf vocabulary", () => {
    expect(Object.keys(leaves)).toEqual([
      "workspace", "editor", "report", "verdict-brief", "attack-path", "blast-radius",
      "phase-timeline", "ttp-chain", "response-plan", "representation-notes",
    ]);
  });

  it("renders semantic structures without agent-authored presentation candidates", () => {
    expect(renderLeaf("verdict-brief")).toMatch(/Mailbox and identity compromise/);
    expect(renderLeaf("attack-path")).toMatch(/Credential Access.*185\.220\.101\.34.*accessed mailbox/s);
    expect(renderLeaf("blast-radius")).toMatch(/Blast radius.*m\.fischer@contoso\.com/s);
    expect(renderLeaf("phase-timeline")).toMatch(/Incident timeline.*Mailbox accessed/s);
    expect(renderLeaf("ttp-chain")).toMatch(/T1114\.002.*Remote Email Collection/s);
    expect(renderLeaf("response-plan")).toMatch(/Response plan.*Revoke sessions/s);
    expect(renderLeaf("representation-notes")).toMatch(/schema-gap.*Business ownership was not modeled/s);
  });

  it("tracks analysis freshness from the exact source content", () => {
    expect(analysisIsStale("new", "old")).toBe(true);
    expect(analysisIsStale("same", "same")).toBe(false);
  });
});