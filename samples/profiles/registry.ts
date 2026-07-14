import {
  loadProfile,
  type ProfileArtifact,
  type RecipeArtifactBase,
  type ResolvedProfile,
} from "@gik/profile";
import type { LayerRecipe } from "./genui";
import briefingProfileJson from "./briefing/profile.json" with { type: "json" };
import briefingRuntimeRecipeJson from "./briefing/interaction-to-runtime.recipe.json" with { type: "json" };
import fourLayersProfileJson from "./4layers/profile.json" with { type: "json" };
import fourLayersWorkflowRecipeJson from "./4layers/workflow-to-interaction.recipe.json" with { type: "json" };
import fourLayersInteractionRecipeJson from "./4layers/interaction-to-presentation.recipe.json" with { type: "json" };
import fourLayersRuntimeRecipeJson from "./4layers/presentation-to-runtime.recipe.json" with { type: "json" };
import liveCardsProfileJson from "./live-cards/profile.json" with { type: "json" };
import liveCardsInteractionRecipeJson from "./live-cards/interaction-to-presentation.recipe.json" with { type: "json" };
import liveCardsRuntimeRecipeJson from "./live-cards/presentation-to-runtime.recipe.json" with { type: "json" };
import { resolveProfileTemplate, resolveProfileTemplateResource } from "./template-resolver";

function recipeArtifacts(...artifacts: readonly unknown[]): readonly RecipeArtifactBase<LayerRecipe>[] {
  return artifacts as unknown as readonly RecipeArtifactBase<LayerRecipe>[];
}

export const liveCardsProfileArtifact = liveCardsProfileJson as ProfileArtifact;
const liveCardsRecipeArtifacts = recipeArtifacts(
  liveCardsInteractionRecipeJson,
  liveCardsRuntimeRecipeJson
);

export const briefingProfileArtifact = briefingProfileJson as ProfileArtifact;
const briefingRecipeArtifacts = recipeArtifacts(
  briefingRuntimeRecipeJson
);
export const fourLayersProfileArtifact = fourLayersProfileJson as ProfileArtifact;
const fourLayersRecipeArtifacts = recipeArtifacts(
  fourLayersWorkflowRecipeJson,
  fourLayersInteractionRecipeJson,
  fourLayersRuntimeRecipeJson
);
export { liveCardsRecipeArtifacts, briefingRecipeArtifacts, fourLayersRecipeArtifacts };
const liveCardsResolvedProfile = loadProfile<LayerRecipe>(
  liveCardsProfileArtifact,
  liveCardsRecipeArtifacts,
  resolveProfileTemplateResource,
  resolveProfileTemplate
);

const briefingResolvedProfile = loadProfile<LayerRecipe>(
  briefingProfileArtifact,
  briefingRecipeArtifacts,
  resolveProfileTemplateResource,
  resolveProfileTemplate
);

const fourLayersResolvedProfile = loadProfile<LayerRecipe>(
  fourLayersProfileArtifact,
  fourLayersRecipeArtifacts,
  resolveProfileTemplateResource,
  resolveProfileTemplate
);

export interface SampleProfileEntry {
  artifact: ProfileArtifact;
  profile: ResolvedProfile<LayerRecipe>;
  recipeArtifacts: readonly RecipeArtifactBase<LayerRecipe>[];
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
  {
    artifact: fourLayersProfileArtifact,
    profile: fourLayersResolvedProfile,
    recipeArtifacts: fourLayersRecipeArtifacts,
  },
] as const;

export const sampleProfiles: Readonly<Record<string, ResolvedProfile<LayerRecipe>>> = Object.fromEntries(
  sampleProfileCatalog.map((entry) => [entry.artifact.payload.id, entry.profile])
);