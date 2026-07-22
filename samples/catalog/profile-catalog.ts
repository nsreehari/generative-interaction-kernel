import {
  loadBlueprint,
  resolveProfileTemplate,
  resolveProfileTemplateResource,
  type BlueprintArtifact,
  type LayerRecipe,
  type ResolvedProfile,
} from "@gik/profile";
import briefingBlueprintJson from "../profiles/briefing/blueprint.json" with { type: "json" };
import fourLayersBlueprintJson from "../profiles/4layers/blueprint.json" with { type: "json" };
import liveCardsBlueprintJson from "../profiles/live-cards/blueprint.json" with { type: "json" };

export const liveCardsBlueprint = liveCardsBlueprintJson as BlueprintArtifact<LayerRecipe>;
export const briefingBlueprint = briefingBlueprintJson as BlueprintArtifact<LayerRecipe>;
export const fourLayersBlueprint = fourLayersBlueprintJson as BlueprintArtifact<LayerRecipe>;

const liveCardsResolvedProfile = loadBlueprint<LayerRecipe>(
  liveCardsBlueprint,
  resolveProfileTemplateResource,
  resolveProfileTemplate
);

const briefingResolvedProfile = loadBlueprint<LayerRecipe>(
  briefingBlueprint,
  resolveProfileTemplateResource,
  resolveProfileTemplate
);

const fourLayersResolvedProfile = loadBlueprint<LayerRecipe>(
  fourLayersBlueprint,
  resolveProfileTemplateResource,
  resolveProfileTemplate
);

export interface SampleBlueprintEntry {
  blueprint: BlueprintArtifact<LayerRecipe>;
  profile: ResolvedProfile<LayerRecipe>;
}

export const sampleBlueprintCatalog: readonly SampleBlueprintEntry[] = [
  {
    blueprint: liveCardsBlueprint,
    profile: liveCardsResolvedProfile,
  },
  {
    blueprint: briefingBlueprint,
    profile: briefingResolvedProfile,
  },
  {
    blueprint: fourLayersBlueprint,
    profile: fourLayersResolvedProfile,
  },
] as const;

export const sampleBlueprintProfiles: Readonly<Record<string, ResolvedProfile<LayerRecipe>>> = Object.fromEntries(
  sampleBlueprintCatalog.map((entry) => [entry.blueprint.payload.id, entry.profile])
);