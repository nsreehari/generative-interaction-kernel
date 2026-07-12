// A sample-authored profile living under `samples/profiles/` (not a built-in of the interaction
// package). It shows how a sample specifies its own lowering pipeline: author the JSON artifacts,
// then hand them to the generic `loadProfile` primitive to get a ready-to-run ResolvedProfile.
//
// "briefing" lowers every interaction into a reading-first narrative: one region per facet,
// metrics for numeric roles, tables for collections, markdown for everything else.

import briefingProfileJson from "./profile.json" with { type: "json" };
import interactionRecipeJson from "./interaction-to-presentation.recipe.json" with { type: "json" };
import runtimeRecipeJson from "./presentation-to-runtime.recipe.json" with { type: "json" };

import { loadProfile } from "../../../interaction/src/index";

export const briefingProfile = loadProfile(briefingProfileJson, [
  interactionRecipeJson,
  runtimeRecipeJson,
]);
