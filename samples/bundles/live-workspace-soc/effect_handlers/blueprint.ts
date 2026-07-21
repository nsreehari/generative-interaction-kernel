import type { DocumentPayload } from "@gik/kernel";
import {
  loadProfile,
  resolveProfileTemplate,
  resolveProfileTemplateResource,
  runProfile,
  traceProfile,
  type LayerRecipe,
  type PresentationSpec,
  type StageTrace,
} from "@gik/profile";

import profileArtifact from "../../../profiles/live-workspace-soc/profile.json" with { type: "json" };
import workflowRecipe from "../../../profiles/live-workspace-soc/workflow-to-interaction.recipe.json" with { type: "json" };
import interactionRecipe from "../../../profiles/live-workspace-soc/interaction-to-presentation.recipe.json" with { type: "json" };
import runtimeRecipe from "../../../profiles/live-workspace-soc/presentation-to-runtime.recipe.json" with { type: "json" };

const recipeArtifacts = [workflowRecipe, interactionRecipe, runtimeRecipe];

export const socBlueprint = loadProfile<LayerRecipe>(
  profileArtifact,
  recipeArtifacts,
  resolveProfileTemplateResource,
  resolveProfileTemplate,
);

export const SOC_BLUEPRINT_PRESENTATION_PRESETS = (
  socBlueprint.resources.presentationPresets as Array<{
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

const SOC_BLUEPRINT_SEED = {
  workflow: "governed-soc-investigation",
  subject: "Privileged access anomaly during payroll cutover",
};

export type SocPresentationContext = {
  id?: string;
  actor?: string;
  role?: string;
  device?: string;
  task?: string;
  disclosure?: string;
  layout?: string;
  frame?: string;
  arrangement?: string;
  regions?: string[];
};

function defaultSocPresentationContext(): SocPresentationContext {
  return SOC_BLUEPRINT_PRESENTATION_PRESETS.find((context) => context.id === "full-substrate") ?? SOC_BLUEPRINT_PRESENTATION_PRESETS[0];
}

function resolveSocPresentationContext(context?: string | SocPresentationContext): SocPresentationContext {
  if (!context) return defaultSocPresentationContext();
  if (typeof context === "string") {
    return SOC_BLUEPRINT_PRESENTATION_PRESETS.find((item) => item.id === context) ?? defaultSocPresentationContext();
  }
  return context;
}

export function traceSocBlueprint(presentationContext?: string | SocPresentationContext): StageTrace[] {
  return traceProfile(socBlueprint, SOC_BLUEPRINT_SEED, resolveSocPresentationContext(presentationContext));
}

export function compileSocPresentation(presentationContext?: string | SocPresentationContext): PresentationSpec & { frame?: string } {
  return traceSocBlueprint(presentationContext)[1].output as PresentationSpec & { frame?: string };
}

export function compileSocDocument(presentationContext?: string | SocPresentationContext): DocumentPayload {
  return runProfile(
    socBlueprint,
    SOC_BLUEPRINT_SEED,
    resolveSocPresentationContext(presentationContext),
  ) as DocumentPayload;
}