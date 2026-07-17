import assert from "node:assert/strict";
import { test } from "vitest";

import socProfile from "../../profiles/live-workspace-soc/profile.json" with { type: "json" };
import t3Scenario from "../../scenarios/live-workspace-soc-t3/scenario.json" with { type: "json" };
import overviewState from "./state.json" with { type: "json" };

const overview = overviewState.overview;
const resources = socProfile.payload.resources;
const canonicalActors = resources.actors.inline;
const canonicalActs = t3Scenario.payload.steps;

test("overview SOC summary stays aligned with the canonical blueprint", () => {
  assert.deepEqual(
    overview.actors.map((actor) => actor.id),
    canonicalActors.map((actor) => actor.id)
  );
  assert.deepEqual(
    overview.socActs.map((act) => ({ id: act.id, title: act.title })),
    canonicalActs.map((act, index) => ({ id: index + 1, title: act.title }))
  );
});

test("overview proof links open the same SOC artifact with optional GIK controls", () => {
  assert.deepEqual(
    overview.proofPlanes.map(({ bundle, gik }) => ({ bundle, gik })),
    [
      { bundle: "live-workspace-soc", gik: false },
      { bundle: "live-workspace-soc", gik: true },
    ]
  );
});

test("overview keeps Tax Prep as a forthcoming expansion without overstating SOC continuity", () => {
  const serialized = JSON.stringify(overview);
  assert.equal(overview.expansion.domains.some((domain) => domain.id === "tax-prep"), true);
  assert.match(overview.expansion.status, /forthcoming/i);
  assert.doesNotMatch(serialized, /analyst steps away|continues autonomously|durable background agents are proven/i);
  assert.match(overview.expansion.boundary, /does not prove/i);
});
