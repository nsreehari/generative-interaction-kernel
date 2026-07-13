// Profiles as first-class, declarative artifacts: an ordered layer graph plus adjacent lowering
// recipes. Verifies the resolver derives the execution chain from the graph (not the declared
// order) and rejects malformed profiles.

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  recipeForKinds,
  resolveProfile,
} from "../src/index";
import { loadProfile, type ProfileArtifact } from "../../profile/src/index";
import { applyProfileTemplate, type ProfileTemplateArtifact } from "../../profile/src/profile-core";
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

test("profile-template default resources merge through core and profile-owned resources override them", () => {
  const artifact: ProfileArtifact = {
    gik: "0.1",
    type: "profile",
    payload: {
      id: "templated",
      kind: "genui-profile",
      version: "0.0.0",
      "profile-template": "genui",
      layers: [
        { id: "interaction", kind: "interaction" },
        { id: "presentation", kind: "presentation" },
      ],
      recipes: [{ id: "live-cards.interaction-to-presentation", from: "interaction", to: "presentation" }],
      resources: {
        taxonomy: { inline: { from: "profile" } as unknown as import("../../../kernel/src/index").Json },
      },
    },
  };

  const template: ProfileTemplateArtifact = {
    gik: "0.1",
    type: "profile-template",
    payload: {
      id: "genui",
      profileKind: "genui-profile",
      defaultResources: {
        taxonomy: { $ref: "profile-template:genui/taxonomy.json" },
        palette: { inline: { from: "template" } as unknown as import("../../../kernel/src/index").Json },
      },
    },
  };

  const applied = applyProfileTemplate(artifact, (id: string) => {
    assert.equal(id, "genui");
    return template;
  });

  assert.deepEqual(applied.payload.resources, {
    taxonomy: { inline: { from: "profile" } },
    palette: { inline: { from: "template" } },
  });

  const resolved = resolveProfile(applied, [liveCardsRecipeArtifacts[0]], (ref) => ({ ref }));
  assert.deepEqual(resolved.resources, {
    taxonomy: { from: "profile" },
    palette: { from: "template" },
  });
});
