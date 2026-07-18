import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveFocusTargets, selectionFromTimelineItem, type TimelineItem } from "../../../shared/demo-runner";
import { compileSocPresentation } from "../../../profiles/live-workspace-soc/compile";

import {
  SOC_FOCUS_TARGETS,
  isActorSelected,
  isCausallyAffected,
  participantPresence,
  socJournalSelection,
} from "./index";

function presentationContract(contextId: string) {
  const presentation = compileSocPresentation(contextId);
  const substrateRegions = presentation.regions.filter((region) => region.materialize === false);
  const visibleRegions = substrateRegions.filter((region) => region.disclosure !== "omitted");
  return {
    frame: presentation.frame,
    arrangement: presentation.arrangement,
    regions: visibleRegions.map((region) => region.name),
    regionFacets: Object.fromEntries(substrateRegions.map((region) => [region.name, {
      visible: region.disclosure !== "omitted",
      rank: region.disclosure === "omitted" ? 50 : visibleRegions.indexOf(region),
      priority: region.priority,
      disclosure: region.disclosure,
      concern: region.concern ?? "substrate",
      group: region.group ?? "substrate",
      presentation: region.presentation ?? "brief",
    }])),
  };
}

const entry = {
  id: "j-07",
  time: "09:42:24",
  actorId: "agent-response",
  result: "rejected+fallback",
  summary: "Blocked DC-01 isolation and applied safe fallback",
  affected: ["proposal-dc01", "DC-01", "Host-A"],
};

test("causal matching uses journal affected identifiers", () => {
  assert.equal(isCausallyAffected(entry, ["proposal-dc01"]), true);
  assert.equal(isCausallyAffected(entry, ["DC-01"]), true);
  assert.equal(isCausallyAffected(entry, ["unrelated-object"]), false);
});

test("aggregate workspace aliases match any represented causal object", () => {
  assert.equal(
    isCausallyAffected(entry, ["proposal-dc01", "proposal-host-a", "rec-1", "authorization"]),
    true
  );
  assert.equal(isCausallyAffected(undefined, ["proposal-dc01"]), false);
});

test("journal entries lower to generic semantic focus selections", () => {
  assert.deepEqual(socJournalSelection(entry), {
    source: "organism",
    itemId: "j-07",
    focusRefs: [
      { namespace: "soc", kind: "actor", id: "agent-response", relation: "origin" },
      { namespace: "soc", kind: "record", id: "proposal-dc01", relation: "affected" },
      { namespace: "soc", kind: "record", id: "DC-01", relation: "affected" },
      { namespace: "soc", kind: "record", id: "Host-A", relation: "affected" },
    ],
  });
  assert.equal(isActorSelected(entry, "agent-response"), true);
  assert.equal(isActorSelected(entry, "human-priya"), false);
});

test("scenario and organism selections resolve through the same SOC focus targets", () => {
  const scenarioItem: TimelineItem = {
    id: "scenario:intent",
    source: "scenario",
    title: "Set intent",
    summary: "Dispatch intent",
    status: "complete",
    actorRef: { namespace: "soc", kind: "actor", id: "human-morgan", relation: "origin" },
    focusRefs: [
      { namespace: "soc", kind: "actor", id: "human-morgan", relation: "origin" },
      { namespace: "soc", kind: "record", id: "intent", relation: "affected" },
    ],
  };
  const organismSelection = socJournalSelection({
    ...entry,
    id: "j-intent",
    actorId: "human-morgan",
    affected: ["intent"],
  });
  const regionIds = (selection: ReturnType<typeof selectionFromTimelineItem> | undefined) =>
    resolveFocusTargets(selection, SOC_FOCUS_TARGETS).map((target) => target.regionId).sort();

  assert.deepEqual(regionIds(selectionFromTimelineItem(scenarioItem)), ["intent", "participant:human-morgan"]);
  assert.deepEqual(regionIds(organismSelection), ["intent", "participant:human-morgan"]);
});

test("participant statuses map to a stable presence vocabulary", () => {
  assert.equal(participantPresence("working"), "working");
  assert.equal(participantPresence("waiting"), "waiting");
  assert.equal(participantPresence("needs-review"), "input-awaited");
  assert.equal(participantPresence("sleeping"), "sleeping");
  assert.equal(participantPresence("complete"), "complete");
  assert.equal(participantPresence("unexpected"), "active");
});

test("presentation contexts produce distinct substrate frames and disclosure", () => {
  const full = presentationContract("full-substrate");
  const mobile = presentationContract("priya-mobile");
  const pager = presentationContract("morgan-pager");
  const correlation = presentationContract("correlation-agent");

  assert.equal(full.frame, "shared");
  assert.equal(full.arrangement, "inspection");
  assert.equal(full.regions.includes("exploration"), true);
  assert.equal(mobile.frame, "mobile");
  assert.equal(mobile.arrangement, "decision");
  assert.equal(mobile.regions.includes("exploration"), false);
  assert.equal(mobile.regions.includes("authorization"), true);
  assert.deepEqual(mobile.regions, ["summary", "authorization", "response", "constraints", "hypothesis"]);
  assert.equal(mobile.regionFacets.authorization.visible, true);
  assert.equal(mobile.regionFacets.authorization.priority, "critical");
  assert.equal(mobile.regionFacets.evidence.visible, false);
  assert.deepEqual(pager.regions, ["summary", "hypothesis", "response"]);
  assert.deepEqual(correlation.regions, ["summary", "intent", "constraints", "hypothesis", "agent-request", "exploration", "evidence", "causal-record"]);
  assert.equal(correlation.regionFacets.evidence.group, "response");
  assert.equal(correlation.regionFacets.evidence.concern, "investigation");
  assert.equal(correlation.regionFacets.evidence.presentation, "collection");
  assert.equal(correlation.regionFacets["agent-request"].presentation, "agent-request");
});
