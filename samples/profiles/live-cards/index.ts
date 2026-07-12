// The live-cards profile as sample-authored data (moved out of the interaction package). A sample
// specifies its lowering pipeline by authoring the JSON artifacts and handing them to the generic
// `loadProfile` primitive — there is no coded profile module in the engine anymore.

import liveCardsProfileJson from "./profile.json" with { type: "json" };
import interactionRecipeJson from "./interaction-to-presentation.recipe.json" with { type: "json" };
import presentationRecipeJson from "./presentation-to-runtime.recipe.json" with { type: "json" };

import {
  loadProfile,
  type LoweringRecipeArtifact,
  type ProfileArtifact,
} from "../../../interaction/src/index";

export const liveCardsProfileArtifact = liveCardsProfileJson as ProfileArtifact;
export const liveCardsRecipeArtifacts = [
  interactionRecipeJson as LoweringRecipeArtifact,
  presentationRecipeJson as LoweringRecipeArtifact,
] as const;

export const liveCardsProfile = loadProfile(liveCardsProfileArtifact, liveCardsRecipeArtifacts);
