import type { BlueprintArtifact } from "../../../profile/src/blueprint";
import type { FlowRegistry } from "../../step-orchestrator/src/step-orchestrator";
import type { StepFlowConfig } from "../../vendor/step-machine/types";

export interface GraphDigest {
  triggered: string[];
  stages: number;
  blocked: number;
  unlocked: string[];
}

export interface BlueprintSeedSummary {
  source: "blueprint";
  id: string;
  kind: string;
  version: string;
  tiers: Array<{ id: string; kind: string }>;
  recipes: Array<{ id: string; from: string; to: string }>;
}

export const profileAuthoringFlow: StepFlowConfig = {
  settings: { start_step: "frame-graphs" },
  steps: {
    "frame-graphs": { transitions: { ok: "compose-profile" } },
    "compose-profile": { transitions: { ok: "select-recipes" } },
    "select-recipes": { transitions: { ok: "done" } },
  },
  terminal_states: {
    done: { return_intent: "planned", return_artifacts: ["profile", "recipes", "notes", "graphDigest", "profileSeed"] },
  },
};

export function createProfileAuthoringRegistry(): FlowRegistry {
  return {
    authorProfilePlan: {
      flow: profileAuthoringFlow,
      handlers: {
        "frame-graphs": (input: Record<string, unknown>) => {
          const objective = String(input.objective ?? "provider-authoring");
          const surface = String(input.surface ?? "copilot");
          const changedSource = String(input.changedSource ?? "portfolio");
          const consequence = asRecord(input.consequence);
          const exploratory = asRecord(input.exploratory);
          const profileSeed = summarizeBlueprint(input.blueprint);
          return {
            result: "ok",
            data: {
              objective,
              surface,
              changedSource,
              graphDigest: buildGraphDigest(consequence, exploratory),
              profileSeed,
            },
          };
        },
        "compose-profile": (input: Record<string, unknown>) => {
          const objective = String(input.objective ?? "provider-authoring");
          const surface = String(input.surface ?? "copilot");
          const graphDigest = asRecord(input.graphDigest);
          const profileSeed = asProfileSeed(input.profileSeed);
          return {
            result: "ok",
            data: {
              ...input,
              profile: profileSeed
                ? buildArtifactBackedProfile(profileSeed, graphDigest)
                : buildDraftProfile(objective, surface, graphDigest),
            },
          };
        },
        "select-recipes": (input: Record<string, unknown>) => {
          const profile = asRecord(input.profile);
          const graphDigest = asRecord(input.graphDigest);
          const profileSeed = asProfileSeed(input.profileSeed);
          return {
            result: "ok",
            data: {
              ...input,
              recipes: buildRecipeSuggestions(profile, graphDigest, profileSeed),
              notes: buildNotes(profileSeed),
            },
          };
        },
      },
      onResult: (result, effect) => ({
        events: [
          {
            node: effect.node,
            name: `${effect.tool}:${result.intent ?? result.status}`,
            payload: {
              ...result.data,
              status: result.status,
              finalStep: result.finalStep,
              stepHistory: result.stepHistory,
            },
          },
        ],
      }),
    },
  };
}

export function summarizeBlueprint(value: unknown): BlueprintSeedSummary | null {
  const blueprint = asBlueprint(value);
  if (!blueprint) return null;
  return {
    source: "blueprint",
    id: blueprint.payload.id,
    kind: blueprint.payload.kind,
    version: blueprint.payload.version,
    tiers: blueprint.payload.tiers.map((tier) => ({ id: tier.id, kind: tier.kind })),
    recipes: blueprint.payload.recipes.map((recipe) => ({
      id: recipe.id,
      from: recipe.from,
      to: recipe.to,
    })),
  };
}

function buildGraphDigest(consequence: Record<string, unknown>, exploratory: Record<string, unknown>): GraphDigest {
  return {
    triggered: asStringArray(consequence.triggered),
    stages: asArray(consequence.parallelStages).length,
    blocked: asArray(consequence.blocked).length,
    unlocked: asStringArray(exploratory.unlocked),
  };
}

function buildDraftProfile(objective: string, surface: string, graphDigest: Record<string, unknown>) {
  return {
    id: slugify(`${objective}-${surface}`),
    objective,
    surface,
    source: "graph-driven",
    layers: [
      { id: "interaction.intent", role: "capture goal + context" },
      { id: "analysis.graphs", role: "materialize consequence + exploratory state" },
      { id: "planning.recipes", role: "select lowering recipes from graph evidence" },
      { id: `presentation.${surface}`, role: "render authoring output for the target surface" },
    ],
    signals: graphDigest,
  };
}

function buildArtifactBackedProfile(profileSeed: BlueprintSeedSummary, graphDigest: Record<string, unknown>) {
  return {
    id: profileSeed.id,
    kind: profileSeed.kind,
    version: profileSeed.version,
    source: profileSeed.source,
    layers: profileSeed.tiers,
    declaredRecipes: profileSeed.recipes,
    signals: graphDigest,
  };
}

function buildRecipeSuggestions(
  profile: Record<string, unknown>,
  graphDigest: Record<string, unknown>,
  profileSeed: BlueprintSeedSummary | null
) {
  const triggered = asStringArray(graphDigest.triggered);
  const unlocked = asStringArray(graphDigest.unlocked);
  if (profileSeed && profileSeed.recipes.length > 0) {
    return profileSeed.recipes.map((recipe, index) => ({
      id: recipe.id,
      from: recipe.from,
      to: recipe.to,
      source: "declared-profile",
      rationale: artifactRecipeRationale(index, triggered, unlocked, recipe.to),
      backedByArtifact: recipe,
    }));
  }

  return [
    {
      id: "interaction-to-analysis",
      from: "interaction.intent",
      to: "analysis.graphs",
      source: "graph-driven",
      rationale: `Seed consequence activation from ${triggered.join(", ") || "the root change"}.`,
    },
    {
      id: "analysis-to-planning",
      from: "analysis.graphs",
      to: "planning.recipes",
      source: "graph-driven",
      rationale: `Promote unlocked options (${unlocked.join(", ") || "none yet"}) into candidate authoring recipes.`,
    },
    {
      id: "planning-to-presentation",
      from: "planning.recipes",
      to: String(profile.surface ? `presentation.${profile.surface}` : "presentation.copilot"),
      source: "graph-driven",
      rationale: "Shape the selected profile and recipe guidance for the chosen surface.",
    },
  ];
}

function buildNotes(profileSeed: BlueprintSeedSummary | null): string[] {
  const notes = [
    "Reactive state stays authoritative for computed values.",
    "Consequence graph explains downstream recompute and blocking.",
    "Exploratory graph explains unlocked choice frontiers.",
    "StepOrchestrator turns those graph outputs into a resumable authoring plan.",
  ];
  if (profileSeed) {
    notes.push("The plan starts from a declared blueprint and proposes the concrete recipe chain it already carries.");
  }
  return notes;
}

function artifactRecipeRationale(index: number, triggered: string[], unlocked: string[], toLayer: string): string {
  if (index === 0) {
    return `Carry the triggered change set (${triggered.join(", ") || "root state"}) into the declared recipe chain.`;
  }
  if (toLayer.includes("runtime")) {
    return "Lower the chosen presentation through the profile's concrete runtime recipe.";
  }
  return `Use unlocked options (${unlocked.join(", ") || "none yet"}) to constrain how this declared recipe should be applied.`;
}

function asProfileSeed(value: unknown): BlueprintSeedSummary | null {
  const rec = asRecord(value);
  return rec.source === "blueprint" ? (rec as unknown as BlueprintSeedSummary) : null;
}

function asBlueprint(value: unknown): BlueprintArtifact | null {
  const rec = asRecord(value);
  const payload = asRecord(rec.payload);
  if (rec.gik !== "0.1" || rec.type !== "blueprint" || typeof payload.id !== "string") return null;
  return rec as unknown as BlueprintArtifact;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  return asArray(value).map((item) => String(item));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "provider-authoring";
}