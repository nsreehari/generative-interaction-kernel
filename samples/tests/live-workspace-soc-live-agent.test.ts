import assert from "node:assert/strict";
import { test } from "vitest";

import { resolveSampleBlueprintSource } from "../shared/blueprint-catalog";

const blueprint = resolveSampleBlueprintSource("live-workspace-soc");
const soc = blueprint.payload.runtime.state.soc;
const actors = soc.actors;
const events = blueprint.payload.cells["soc-workspace"].behavior.events;

test("SOC Blueprint keeps the agent authority boundary declarative", () => {
  assert.ok(soc.entities.some((entity) => entity.id === "DC-01" && entity.criticality === "protected"));
  assert.ok(actors.some((actor) => actor.id === "agent-correlation" && !actor.authority.includes("authorize")));
  assert.ok(actors.some((actor) => actor.id === "human-priya" && actor.authority.includes("authorize")));
});

test("SOC workflow keeps exploration as a suggestion-only interaction", () => {
  assert.deepEqual(Object.keys(events).filter((event) => event.toLowerCase().includes("exploration")), [
    "suggestExploration",
    "amendExploration",
    "replanExploration",
  ]);
  assert.equal(events.suggestExploration[0].do, "invoke");
  assert.equal(events.authorizeContainment[0].do, "confirm");
});