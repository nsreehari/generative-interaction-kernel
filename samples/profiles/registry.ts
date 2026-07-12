import {
  loadProfile,
  type LoweringRecipeArtifact,
  type ProfileArtifact,
  type ResolvedProfile,
} from "@gik/profile";
import briefingProfileJson from "./briefing/profile.json" with { type: "json" };
import briefingInteractionRecipeJson from "./briefing/interaction-to-presentation.recipe.json" with { type: "json" };
import briefingRuntimeRecipeJson from "./briefing/presentation-to-runtime.recipe.json" with { type: "json" };
import liveCardsProfileJson from "./live-cards/profile.json" with { type: "json" };
import liveCardsInteractionRecipeJson from "./live-cards/interaction-to-presentation.recipe.json" with { type: "json" };
import liveCardsRuntimeRecipeJson from "./live-cards/presentation-to-runtime.recipe.json" with { type: "json" };

function recipeArtifacts(...artifacts: readonly unknown[]): readonly LoweringRecipeArtifact[] {
  return artifacts as unknown as readonly LoweringRecipeArtifact[];
}

const liveCardsProfileArtifact = liveCardsProfileJson as ProfileArtifact;
const liveCardsRecipeArtifacts = recipeArtifacts(
  liveCardsInteractionRecipeJson,
  liveCardsRuntimeRecipeJson
);
const liveCardsProfile = loadProfile(liveCardsProfileArtifact, liveCardsRecipeArtifacts);

const briefingProfileArtifact = briefingProfileJson as ProfileArtifact;
const briefingRecipeArtifacts = recipeArtifacts(
  briefingInteractionRecipeJson,
  briefingRuntimeRecipeJson
);
const briefingProfile = loadProfile(briefingProfileArtifact, briefingRecipeArtifacts);

export interface SampleProfileEntry {
  artifact: ProfileArtifact;
  profile: ResolvedProfile;
  recipeArtifacts: readonly LoweringRecipeArtifact[];
}

export const sampleProfileCatalog: readonly SampleProfileEntry[] = [
  {
    artifact: liveCardsProfileArtifact,
    profile: liveCardsProfile,
    recipeArtifacts: liveCardsRecipeArtifacts,
  },
  {
    artifact: briefingProfileArtifact,
    profile: briefingProfile,
    recipeArtifacts: briefingRecipeArtifacts,
  },
] as const;

export const sampleProfiles: Readonly<Record<string, ResolvedProfile>> = Object.fromEntries(
  sampleProfileCatalog.map((entry) => [entry.artifact.payload.id, entry.profile])
);