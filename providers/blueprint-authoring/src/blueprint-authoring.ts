import type { BlueprintArtifact } from "../../../blueprint/src/types";
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

export const blueprintAuthoringFlow: StepFlowConfig = {
  settings: { start_step: "frame-graphs" },
  steps: {
    "frame-graphs": { transitions: { ok: "compose-blueprint" } },
    "compose-blueprint": { transitions: { ok: "select-recipes" } },
    "select-recipes": { transitions: { ok: "done" } },
  },
  terminal_states: {
    done: { return_intent: "planned", return_artifacts: ["blueprint", "recipes", "notes", "graphDigest", "blueprintSeed"] },
  },
};

export function createBlueprintAuthoringRegistry(): FlowRegistry {
  return {
    authorBlueprintPlan: {
      flow: blueprintAuthoringFlow,
      handlers: {
        "frame-graphs": (input: Record<string, unknown>) => {
          const objective = String(input.objective ?? "provider-authoring");
          const surface = String(input.surface ?? "copilot");
          const changedSource = String(input.changedSource ?? "portfolio");
          const consequence = asRecord(input.consequence);
          const exploratory = asRecord(input.exploratory);
          const blueprintSeed = summarizeBlueprint(input.blueprint);
          return {
            result: "ok",
            data: {
              objective,
              surface,
              changedSource,
              graphDigest: buildGraphDigest(consequence, exploratory),
              blueprintSeed,
            },
          };
        },
        "compose-blueprint": (input: Record<string, unknown>) => {
          const objective = String(input.objective ?? "provider-authoring");
          const surface = String(input.surface ?? "copilot");
          const graphDigest = asRecord(input.graphDigest);
          const blueprintSeed = asBlueprintSeed(input.blueprintSeed);
          return {
            result: "ok",
            data: {
              ...input,
              blueprint: blueprintSeed
                ? buildArtifactBackedBlueprint(blueprintSeed, graphDigest)
                : buildDraftBlueprint(objective, surface, graphDigest),
            },
          };
        },
        "select-recipes": (input: Record<string, unknown>) => {
          const blueprint = asRecord(input.blueprint);
          const graphDigest = asRecord(input.graphDigest);
          const blueprintSeed = asBlueprintSeed(input.blueprintSeed);
          return {
            result: "ok",
            data: {
              ...input,
              recipes: buildRecipeSuggestions(blueprint, graphDigest, blueprintSeed),
              notes: buildNotes(blueprintSeed),
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

function buildDraftBlueprint(objective: string, surface: string, graphDigest: Record<string, unknown>) {
  return {
    id: slugify(`${objective}-${surface}`),
    objective,
    surface,
    source: "graph-driven",
    tiers: [
      { id: "interaction.intent", role: "capture goal + context" },
      { id: "analysis.graphs", role: "materialize consequence + exploratory state" },
      { id: "planning.recipes", role: "select lowering recipes from graph evidence" },
      { id: `presentation.${surface}`, role: "render authoring output for the target surface" },
    ],
    signals: graphDigest,
  };
}

function buildArtifactBackedBlueprint(blueprintSeed: BlueprintSeedSummary, graphDigest: Record<string, unknown>) {
  return {
    id: blueprintSeed.id,
    kind: blueprintSeed.kind,
    version: blueprintSeed.version,
    source: blueprintSeed.source,
    tiers: blueprintSeed.tiers,
    declaredRecipes: blueprintSeed.recipes,
    signals: graphDigest,
  };
}

function buildRecipeSuggestions(
  blueprint: Record<string, unknown>,
  graphDigest: Record<string, unknown>,
  blueprintSeed: BlueprintSeedSummary | null
) {
  const triggered = asStringArray(graphDigest.triggered);
  const unlocked = asStringArray(graphDigest.unlocked);
  if (blueprintSeed) {
    return blueprintSeed.recipes.map((recipe, index) => ({
      id: recipe.id,
      from: recipe.from,
      to: recipe.to,
      source: "declared-blueprint",
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
      to: String(blueprint.surface ? `presentation.${blueprint.surface}` : "presentation.copilot"),
      source: "graph-driven",
      rationale: "Shape the selected blueprint and recipe guidance for the chosen surface.",
    },
  ];
}

function buildNotes(blueprintSeed: BlueprintSeedSummary | null): string[] {
  const notes = [
    "Reactive state stays authoritative for computed values.",
    "Consequence graph explains downstream recompute and blocking.",
    "Exploratory graph explains unlocked choice frontiers.",
    "StepOrchestrator turns those graph outputs into a resumable authoring plan.",
  ];
  if (blueprintSeed) {
    notes.push(blueprintSeed.recipes.length > 0
      ? "The plan starts from a declared blueprint and proposes the concrete recipe chain it already carries."
      : "The plan starts from a declared terminal Blueprint and does not invent a recipe chain.");
  }
  return notes;
}

function artifactRecipeRationale(index: number, triggered: string[], unlocked: string[], toTier: string): string {
  if (index === 0) {
    return `Carry the triggered change set (${triggered.join(", ") || "root state"}) into the declared recipe chain.`;
  }
  if (toTier.includes("runtime")) {
    return "Lower the chosen presentation through the blueprint's concrete runtime recipe.";
  }
  return `Use unlocked options (${unlocked.join(", ") || "none yet"}) to constrain how this declared recipe should be applied.`;
}

function asBlueprintSeed(value: unknown): BlueprintSeedSummary | null {
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