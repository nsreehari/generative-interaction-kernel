import {
  loadProfile,
  resolveProfileTemplate,
  resolveProfileTemplateResource,
  traceProfile,
  type LayerRecipe,
  type PresentationSpec,
  type StageTrace,
} from "@gik/profile";

import profileArtifact from "./profile.json" with { type: "json" };
import workflowRecipe from "./workflow-to-interaction.recipe.json" with { type: "json" };
import interactionRecipe from "./interaction-to-presentation.recipe.json" with { type: "json" };
import runtimeRecipe from "./presentation-to-runtime.recipe.json" with { type: "json" };

const recipeArtifacts = [workflowRecipe, interactionRecipe, runtimeRecipe];

export const socBlueprint = loadProfile<LayerRecipe>(
  profileArtifact,
  recipeArtifacts,
  resolveProfileTemplateResource,
  resolveProfileTemplate
);

export const SOC_BLUEPRINT_CONTEXTS = (
  socBlueprint.resources.presentationContexts as Array<{
    id: string;
    actor: string;
    role: string;
    device: string;
    task: string;
    disclosure: string;
    layout: string;
    frame: string;
    arrangement: string;
    regions: string[];
  }>
);

export const SOC_BLUEPRINT_SEED = {
  workflow: "governed-soc-investigation",
  subject: "Privileged access anomaly during payroll cutover",
};

export function traceSocBlueprint(presentationContext = "war-room"): StageTrace[] {
  return traceProfile(socBlueprint, SOC_BLUEPRINT_SEED, { presentationContext });
}

export function compileSocPresentation(presentationContext = "war-room"): PresentationSpec {
  return traceSocBlueprint(presentationContext)[1].output as PresentationSpec;
}

export function compileSocDocument(presentationContext = "war-room"): unknown {
  return traceSocBlueprint(presentationContext).at(-1)?.output;
}
