import type { DocumentPayload } from "@gik/kernel";
import {
  loadBlueprint,
  resolveProfileTemplate,
  resolveProfileTemplateResource,
  runProfile,
  traceProfile,
  type LayerRecipe,
  type PresentationSpec,
  type StageTrace,
} from "@gik/profile";

import blueprintArtifact from "../../../profiles/live-workspace-soc/blueprint.json" with { type: "json" };

export const socBlueprint = loadBlueprint<LayerRecipe>(
  blueprintArtifact,
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