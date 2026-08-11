import assert from "node:assert/strict";
import { test } from "vitest";

import { openSampleBlueprint, resolveSampleBlueprintSource } from "../catalog/blueprint-catalog";

const overview = openSampleBlueprint("samples-overview").state.overview as unknown as {
  actors: Array<{ id: string }>;
  proofPlanes: Array<{ blueprint: string; gik: boolean }>;
  expansion: { domains: Array<{ id: string }>; status: string; boundary: string };
};
const canonicalActors = resolveSampleBlueprintSource("live-workspace-soc").payload.runtime.state.soc.actors;

test("overview SOC actors stay aligned with the canonical blueprint", () => {
  assert.deepEqual(
    overview.actors.map((actor) => actor.id),
    canonicalActors.map((actor) => actor.id)
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
