import {
  loadProfile,
  type ProfileArtifact,
  type RecipeArtifactBase,
  type ResolvedProfile,
} from "@gik/profile";
import briefingProfileJson from "./briefing/profile.json" with { type: "json" };
import briefingInteractionRecipeJson from "./briefing/interaction-to-presentation.recipe.json" with { type: "json" };
import briefingRuntimeRecipeJson from "./briefing/presentation-to-runtime.recipe.json" with { type: "json" };
import liveCardsProfileJson from "./live-cards/profile.json" with { type: "json" };
import liveCardsInteractionRecipeJson from "./live-cards/interaction-to-presentation.recipe.json" with { type: "json" };
import liveCardsRuntimeRecipeJson from "./live-cards/presentation-to-runtime.recipe.json" with { type: "json" };
import { resolveProfileTemplate, resolveProfileTemplateResource } from "./template-resolver";

function recipeArtifacts(...artifacts: readonly unknown[]): readonly RecipeArtifactBase[] {
  return artifacts as unknown as readonly RecipeArtifactBase[];
}

export const liveCardsProfileArtifact = liveCardsProfileJson as ProfileArtifact;
const liveCardsRecipeArtifacts = recipeArtifacts(
  liveCardsInteractionRecipeJson,
  liveCardsRuntimeRecipeJson
);

export const briefingProfileArtifact = briefingProfileJson as ProfileArtifact;
const briefingRecipeArtifacts = recipeArtifacts(
  briefingInteractionRecipeJson,
  briefingRuntimeRecipeJson
);
export { liveCardsRecipeArtifacts, briefingRecipeArtifacts };
const liveCardsResolvedProfile = loadProfile(
  liveCardsProfileArtifact,
  liveCardsRecipeArtifacts,
  resolveProfileTemplateResource,
  resolveProfileTemplate
);

const briefingResolvedProfile = loadProfile(
  briefingProfileArtifact,
  briefingRecipeArtifacts,
  resolveProfileTemplateResource,
  resolveProfileTemplate
);

export interface SampleProfileEntry {
  artifact: ProfileArtifact;
  profile: ResolvedProfile;
  recipeArtifacts: readonly RecipeArtifactBase[];
}

export const sampleProfileCatalog: readonly SampleProfileEntry[] = [
  {
    artifact: liveCardsProfileArtifact,
    profile: liveCardsResolvedProfile,
    recipeArtifacts: liveCardsRecipeArtifacts,
  },
  {
    artifact: briefingProfileArtifact,
    profile: briefingResolvedProfile,
    recipeArtifacts: briefingRecipeArtifacts,
  },
] as const;

export const sampleProfiles: Readonly<Record<string, ResolvedProfile>> = Object.fromEntries(
  sampleProfileCatalog.map((entry) => [entry.artifact.payload.id, entry.profile])
);