// Profiles as first-class, declarative artifacts: an ordered layer graph plus adjacent lowering
// recipes. Verifies the resolver derives the execution chain from the graph (not the declared
// order), rejects malformed profiles, and that authored sessions carry a profile identity so replay
// is deterministic across profiles/versions.

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  checkAuthoredProfile,
  parseAuthoredSession,
  recipeForKinds,
  resolveProfile,
  toAuthoredSession,
  type ProfileArtifact,
} from "../src/index";
import {
  liveCardsProfile,
  liveCardsProfileArtifact,
  liveCardsRecipeArtifacts,
} from "./live-cards-fixture";

test("resolveProfile derives the execution chain from the layer graph, not the declared order", () => {
  // Declare the recipes back-to-front; resolution must still order them source -> terminal.
  const reordered: ProfileArtifact = {
    ...liveCardsProfileArtifact,
    payload: {
      ...liveCardsProfileArtifact.payload,
      recipes: [
        { id: "live-cards.presentation-to-runtime", from: "presentation", to: "runtime-document" },
        { id: "live-cards.interaction-to-presentation", from: "interaction", to: "presentation" },
      ],
    },
  };

  const resolved = resolveProfile(reordered, liveCardsRecipeArtifacts);
  assert.deepEqual(
    resolved.stages.map((s) => `${s.fromLayer.kind}->${s.toLayer.kind}`),
    ["interaction->presentation", "presentation->runtime-document"],
    "stages walk the graph from the unique source layer to the terminal layer"
  );
});

test("recipeForKinds returns the recipe connecting two layer kinds, or throws for an unknown pair", () => {
  const planning = recipeForKinds(liveCardsProfile, "interaction", "presentation");
  const lowering = recipeForKinds(liveCardsProfile, "presentation", "runtime-document");
  assert.equal(planning.from, "interaction");
  assert.equal(planning.to, "presentation");
  assert.equal(lowering.from, "presentation");
  assert.equal(lowering.to, "runtime-document");
  assert.throws(() => recipeForKinds(liveCardsProfile, "presentation", "interaction"));
});

test("resolveProfile rejects a profile whose recipes do not form one connected chain", () => {
  const missingRecipe: ProfileArtifact = {
    gik: "0.1",
    type: "profile",
    payload: {
      id: "broken",
      kind: "genui-profile",
      version: "0.0.0",
      layers: [
        { id: "interaction", kind: "interaction" },
        { id: "presentation", kind: "presentation" },
      ],
      recipes: [{ id: "not-provided", from: "interaction", to: "presentation" }],
    },
  };
  assert.throws(() => resolveProfile(missingRecipe, []), /missing recipe artifact/);

  // a profile with two independent source layers is not a single connected chain.
  const twoSources: ProfileArtifact = {
    gik: "0.1",
    type: "profile",
    payload: {
      id: "two-sources",
      kind: "genui-profile",
      version: "0.0.0",
      layers: [
        { id: "interaction", kind: "interaction" },
        { id: "presentation", kind: "presentation" },
        { id: "runtime-document", kind: "runtime-document" },
      ],
      recipes: [
        { id: "live-cards.interaction-to-presentation", from: "interaction", to: "presentation" },
        { id: "live-cards.presentation-to-runtime", from: "runtime-document", to: "presentation" },
      ],
    },
  };
  assert.throws(() => resolveProfile(twoSources, liveCardsRecipeArtifacts), /exactly one source layer/);
});

test("authored sessions carry a profile identity and are guarded against the host before replay", () => {
  const authored = toAuthoredSession(
    { interaction: "investigate", subject: "incident" },
    { surface: "desktop" },
    { disabled: [], priority: {}, disclosure: {}, order: [] },
    { id: "live-cards", version: "0.1.0" }
  );
  assert.deepEqual(authored.profile, { id: "live-cards", version: "0.1.0" });

  // a serialized session without profile identity is rejected at the import boundary.
  const noProfile = JSON.stringify({ interaction: { interaction: "investigate", subject: "incident" } });
  assert.equal(parseAuthoredSession(noProfile).error, "missing profile.id / profile.version");

  // a well-formed session round-trips.
  const parsed = parseAuthoredSession(JSON.stringify(authored));
  assert.equal(parsed.error, "");
  assert.deepEqual(parsed.authored?.profile, { id: "live-cards", version: "0.1.0" });

  // the replay guard passes on an exact match and explains a mismatch otherwise.
  assert.equal(checkAuthoredProfile(authored, "live-cards", "0.1.0"), "");
  assert.match(checkAuthoredProfile(authored, "live-cards", "0.2.0"), /v0\.1\.0.*v0\.2\.0/);
  assert.match(checkAuthoredProfile(authored, "other-profile", "0.1.0"), /other-profile/);
});
