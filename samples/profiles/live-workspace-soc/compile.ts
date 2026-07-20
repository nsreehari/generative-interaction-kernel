import {
  loadProfile,
  resolveProfileTemplate,
  resolveProfileTemplateResource,
  traceProfile,
  type LayerRecipe,
  type PresentationSpec,
  type StageTrace,
} from "@gik/profile";
import type { DocumentPayload } from "@gik/kernel";

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

export function traceSocBlueprint(presentationContext = "full-substrate"): StageTrace[] {
  return traceProfile(socBlueprint, SOC_BLUEPRINT_SEED, { presentationContext });
}

export function compileSocPresentation(presentationContext = "full-substrate"): PresentationSpec & { frame?: string } {
  return traceSocBlueprint(presentationContext)[1].output as PresentationSpec & { frame?: string };
}

export function compileSocDocument(presentationContext = "full-substrate"): DocumentPayload {
  const document = structuredClone(traceSocBlueprint(presentationContext).at(-1)?.output) as DocumentPayload;
  document.root.edges ??= {};
  document.root.edges.children ??= [];
  document.root.edges.children.unshift({
    capability: "foundry:access-modal",
    id: "foundry-access-gate-region",
    props: { proxyBaseUrl: "https://sz-foundry-proxy.azurewebsites.net" },
    edges: {
      read: { required: "soc.foundry.required" },
      on: {
        accessResolved: [{ do: "invoke", args: { tool: "acceptSocFoundryAccess" } }],
        accessCleared: [{ do: "invoke", args: { tool: "clearSocFoundryAccess" } }],
      },
    },
  });
  const workspace = document.root.edges.children.find((child) => child.id === "soc-workspace");
  if (!workspace) throw new Error("SOC lowering did not produce the workspace root");
  workspace.edges ??= {};
  const commands = [
    "establishIntent",
    "addConstraint",
    "suggestExploration",
    "amendExploration",
    "replanExploration",
    "commitPartialFindings",
    "proposeDc01",
    "completeCorrelation",
    "proposeHostA",
    "reviseResponse",
    "calculateResponse",
    "recommendContainment",
    "executeContainment",
    "reset",
  ];
  workspace.edges.react = [
    { when: "$string(soc)", runInitially: true, run: [{ do: "invoke", args: { tool: "syncInspection" } }] },
    ...commands.map((command) => ({
      when: `control.commands.${command}`,
      run: [{ do: "emit" as const, event: command }],
    })),
    { when: "control.presentationContext", runInitially: true, run: [{ do: "emit", event: "setPresentationContext" }] },
    { when: "control.agentModeRequest", runInitially: true, run: [{ do: "emit", event: "setAgentMode" }] },
    { when: "control.participantConfigurationRequest", runInitially: true, run: [{ do: "emit", event: "setAgentMode" }] },
    { when: "control.authorizationRequest", runInitially: true, run: [{ do: "emit", event: "authorizeContainment" }] },
  ];
  workspace.edges.on ??= {};
  workspace.edges.on.reset = [{ do: "invoke", args: { tool: "resetScenario" } }];
  return document;
}

export const blueprint = socBlueprint;
export const lowerBlueprint = (context: Record<string, unknown>) =>
  compileSocDocument(typeof context.presentationContext === "string" ? context.presentationContext : undefined);
