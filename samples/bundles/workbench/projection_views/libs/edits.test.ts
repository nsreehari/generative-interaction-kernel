// Region edit transforms + the applyPresentationEdits reducer, proven as pure prev->next functions,
// so a non-UI caller (an agent authoring overrides, or this test) mutates a PresentationEdits the
// same way the workbench drag/select surface does. Moved out of the interaction package with the
// reducers they cover — the workbench bundle is their only consumer.

import { test } from "vitest";
import assert from "node:assert/strict";
import taxonomyJson from "../../../../../profile-templates/genui/taxonomy.json" with { type: "json" };

import type { PresentationSpec, PresentationEdits } from "../../../../profiles/genui";
import {
  applyPresentationEdits,
  emptyEdits,
  moveRegion,
  reorderRegion,
  setRegionDisclosure,
  setRegionPriority,
  toggleRegion,
} from "./edits";

const taxonomy = taxonomyJson as import("../../../../profiles/genui").InteractionTaxonomy;

const ORDER = ["context", "evidence", "timeline"];

test("toggleRegion adds then removes a region from disabled (immutably)", () => {
  const hidden = toggleRegion(emptyEdits, "timeline");
  assert.deepEqual(hidden.disabled, ["timeline"]);
  assert.deepEqual(emptyEdits.disabled, []); // input untouched
  assert.deepEqual(toggleRegion(hidden, "timeline").disabled, []);
});

test("setRegionPriority / setRegionDisclosure record sparse per-region overrides", () => {
  const a = setRegionPriority(emptyEdits, "context", "primary");
  assert.deepEqual(a.priority, { context: "primary" });
  const b = setRegionDisclosure(a, "context", "collapsed");
  assert.deepEqual(b.disclosure, { context: "collapsed" });
  assert.deepEqual(b.priority, { context: "primary" });
});

test("reorderRegion pins the dragged region into the target's slot from the full display order", () => {
  const next = reorderRegion(emptyEdits, ORDER, "timeline", "context");
  assert.deepEqual(next.order, ["timeline", "context", "evidence"]);
});

test("reorderRegion is a no-op (same reference) for equal names or absent names", () => {
  assert.equal(reorderRegion(emptyEdits, ORDER, "context", "context"), emptyEdits);
  assert.equal(reorderRegion(emptyEdits, ORDER, "ghost", "context"), emptyEdits);
});

test("moveRegion nudges one slot and is a no-op (same reference) at the ends", () => {
  assert.deepEqual(moveRegion(emptyEdits, ORDER, "evidence", -1).order, ["evidence", "context", "timeline"]);
  assert.deepEqual(moveRegion(emptyEdits, ORDER, "evidence", 1).order, ["context", "timeline", "evidence"]);
  assert.equal(moveRegion(emptyEdits, ORDER, "context", -1), emptyEdits);
  assert.equal(moveRegion(emptyEdits, ORDER, "timeline", 1), emptyEdits);
});

test("the region transforms compose into a single edit set", () => {
  let edits = emptyEdits;
  edits = toggleRegion(edits, "evidence");
  edits = setRegionPriority(edits, "context", "primary");
  edits = moveRegion(edits, ORDER, "timeline", -1);
  assert.deepEqual(edits.disabled, ["evidence"]);
  assert.deepEqual(edits.priority, { context: "primary" });
  assert.deepEqual(edits.order, ["context", "timeline", "evidence"]);
});

test("presentation edits are sparse overrides on top of the planner (hide, re-rank, disclose, reorder)", () => {
  // an investigate presentation (context/evidence/timeline/relationships/explanation/actions;
  // relationships is the one optional facet). The reducer reads spec.source to know required facets.
  const planned: PresentationSpec = {
    layout: "investigate_workspace",
    arrangement: "grid",
    source: { interaction: "investigate", subject: "incident" },
    regions: [
      { name: "context", role: "narrative", priority: "primary", disclosure: "always" },
      { name: "evidence", role: "collection", priority: "secondary", disclosure: "always" },
      { name: "timeline", role: "timeline", priority: "secondary", disclosure: "always" },
      { name: "relationships", role: "graph", priority: "tertiary", disclosure: "collapsed" },
      { name: "explanation", role: "narrative", priority: "secondary", disclosure: "always" },
      { name: "actions", role: "actions", priority: "secondary", disclosure: "always" },
    ],
  };
  const names = planned.regions.map((r) => r.name);

  // baseline: an empty edit set is a no-op — defer entirely to the planner.
  assert.deepEqual(
    applyPresentationEdits(planned, { disabled: [], priority: {}, disclosure: {}, order: [] }, taxonomy).regions,
    planned.regions,
    "empty edits leave the planned presentation untouched"
  );

  const edits: PresentationEdits = {
    disabled: ["relationships"], // an optional facet -> dropped
    priority: { evidence: "primary" },
    disclosure: { timeline: "on-demand" },
    order: ["actions"], // pin actions to the front
  };
  const edited = applyPresentationEdits(planned, edits, taxonomy);
  const editedNames = edited.regions.map((r) => r.name);

  assert.ok(!editedNames.includes("relationships"), "a disabled optional facet is hidden");
  assert.equal(edited.regions[0].name, "actions", "a pinned region leads the order");
  assert.equal(edited.regions.find((r) => r.name === "evidence")?.priority, "primary", "priority override applies");
  assert.equal(
    edited.regions.find((r) => r.name === "timeline")?.disclosure,
    "on-demand",
    "disclosure override applies"
  );
  // untouched regions keep their planned placement (overrides are sparse, not a full freeze).
  const context = planned.regions.find((r) => r.name === "context")!;
  assert.equal(
    edited.regions.find((r) => r.name === "context")?.disclosure,
    context.disclosure,
    "a region the user left alone keeps the planner's disclosure"
  );

  // a required facet can never be dropped, even if explicitly disabled.
  const stubborn = applyPresentationEdits(planned, {
    disabled: ["context"],
    priority: {},
    disclosure: {},
    order: [],
  }, taxonomy);
  assert.ok(
    stubborn.regions.some((r) => r.name === "context"),
    "a required facet survives an attempt to disable it"
  );
  assert.deepEqual(names, planned.regions.map((r) => r.name), "the planner output is not mutated by editing");
});
