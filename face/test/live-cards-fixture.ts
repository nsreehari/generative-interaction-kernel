// Engine test fixture: the live-cards profile loaded from the shared JSON fixtures in
// `schemas/fixtures/`, kept face-local so the face tests do not import sample-authored data.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { loadProfile, type LoweringRecipeArtifact, type ProfileArtifact } from "@gik/profile";

const fx = (name: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../schemas/fixtures/${name}`, import.meta.url)), "utf8")
  );

export const liveCardsProfile = loadProfile(
  fx("live-cards.profile.json") as ProfileArtifact,
  [
    fx("live-cards.interaction-to-presentation.recipe.json") as LoweringRecipeArtifact,
    fx("live-cards.presentation-to-runtime.recipe.json") as LoweringRecipeArtifact,
  ]
);
