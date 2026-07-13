// Engine test fixture: the live-cards profile loaded from the shared JSON fixtures in
// `schemas/fixtures/`. The engine tests own this fixture so they are decoupled from the
// sample-authored profile in `samples/profiles/live-cards`; editing the sample never breaks
// the engine's own coverage.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { loadProfile, type ProfileArtifact, type RecipeArtifactBase } from "../../profile/src/index";
import { resolveProfileTemplate, resolveProfileTemplateResource } from "../../../samples/profiles/template-resolver";

const fx = (name: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../../schemas/fixtures/${name}`, import.meta.url)), "utf8")
  );

export const liveCardsProfileArtifact = fx("live-cards.profile.json") as ProfileArtifact;
export const liveCardsRecipeArtifacts = [
  fx("live-cards.interaction-to-presentation.recipe.json") as RecipeArtifactBase,
  fx("live-cards.presentation-to-runtime.recipe.json") as RecipeArtifactBase,
];

export const liveCardsProfile = loadProfile(
  liveCardsProfileArtifact,
  liveCardsRecipeArtifacts,
  resolveProfileTemplateResource,
  resolveProfileTemplate
);
