import assert from "node:assert/strict";
import { test } from "vitest";

import blueprint from "../profiles/live-workspace-soc/blueprint.json" with { type: "json" };

const actors = blueprint.payload.resources.actors.inline;
const authorityPolicy = blueprint.payload.resources.authorityPolicy.inline;
const parts = blueprint.payload.recipes[0]?.program?.[0]?.emit?.parts ?? [];
const exploration = parts.find((part) => part.name === "exploration");

test("SOC profile keeps the agent authority boundary declarative", () => {
  assert.equal(authorityPolicy.participationDoesNotImplyAuthority, true);
  assert.deepEqual(authorityPolicy.protectedTargets, ["DC-01"]);
  assert.ok(actors.some((actor) => actor.id === "agent-correlation" && actor.authority.includes("suggest-exploration")));
  assert.ok(actors.some((actor) => actor.id === "human-priya" && actor.authority.includes("authorize-containment")));
});

test("SOC workflow keeps exploration as a suggestion-only interaction", () => {
  assert.ok(exploration);
  assert.deepEqual(exploration?.actions, ["suggestExploration", "amendExploration", "replanExploration"]);
  assert.deepEqual(exploration?.authority, ["direct-investigation", "suggest-exploration"]);
  assert.ok(parts.every((part) => !part.actions || !part.actions.includes("authorizeContainment") || part.name === "authorization"));
});