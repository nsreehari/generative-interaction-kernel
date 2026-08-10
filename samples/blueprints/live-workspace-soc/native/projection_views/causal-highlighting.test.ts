import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveFocusTargets, selectionFromTimelineItem, type TimelineItem } from "./control-focus";

import {
  SOC_FOCUS_TARGETS,
  isActorSelected,
  isCausallyAffected,
  participantPresence,
  socJournalSelection,
} from "./liveWorkspaceSocLeaves";

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
