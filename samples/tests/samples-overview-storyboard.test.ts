import assert from "node:assert/strict";
import { test } from "vitest";

import socBlueprint from "../blueprints/live-workspace-soc/blueprint.json" with { type: "json" };
import t3Scenario from "../scenarios/live-workspace-soc-t3/scenario.json" with { type: "json" };
import { openSampleBlueprint } from "../shared/blueprints";

const overview = openSampleBlueprint("samples-overview").state.overview as unknown as {
  actors: Array<{ id: string }>;
  socActs: Array<{ id: number; title: string }>;
  proofPlanes: Array<{ blueprint: string; gik: boolean }>;
  expansion: { domains: Array<{ id: string }>; status: string; boundary: string };
};
const canonicalActors = socBlueprint.payload.runtime.state.soc.actors;
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
    overview.proofPlanes.map(({ blueprint, gik }) => ({ blueprint, gik })),
    [
      { blueprint: "live-workspace-soc", gik: false },
      { blueprint: "live-workspace-soc", gik: true },
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
