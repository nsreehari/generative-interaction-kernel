import type { ProfileArtifact, RecipeArtifactBase } from "../../../interaction/src/profile-core";
import type { FlowRegistry } from "../../step-orchestrator/src/step-orchestrator";
import type { StepFlowConfig } from "../../vendor/step-machine/types";

export interface GraphDigest {
  triggered: string[];
  stages: number;
  blocked: number;
  unlocked: string[];
}

export interface ProfileSeedSummary {
  source: "artifact";
  id: string;
  kind: string;
  version: string;
  layers: Array<{ id: string; kind: string }>;
  recipeRefs: Array<{ id: string; from: string; to: string }>;
  recipeArtifacts: Array<{ id: string; from: string; to: string }>;
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
          const profileSeed = summarizeProfileArtifacts(input.profileArtifact, input.recipeArtifacts);
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

export function summarizeProfileArtifacts(
  profileArtifact: unknown,
  recipeArtifacts: unknown
): ProfileSeedSummary | null {
  const artifact = asProfileArtifact(profileArtifact);
  if (!artifact) return null;
  const recipes = asRecipeArtifacts(recipeArtifacts);
  return {
    source: "artifact",
    id: artifact.payload.id,
    kind: artifact.payload.kind,
    version: artifact.payload.version,
    layers: artifact.payload.layers.map((layer) => ({ id: layer.id, kind: layer.kind })),
    recipeRefs: artifact.payload.recipes.map((ref) => ({ id: ref.id, from: ref.from, to: ref.to })),
    recipeArtifacts: recipes.map((recipe) => ({
      id: recipe.payload.id,
      from: recipe.payload.from,
      to: recipe.payload.to,
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

function buildArtifactBackedProfile(profileSeed: ProfileSeedSummary, graphDigest: Record<string, unknown>) {
  return {
    id: profileSeed.id,
    kind: profileSeed.kind,
    version: profileSeed.version,
    source: profileSeed.source,
    layers: profileSeed.layers,
    declaredRecipes: profileSeed.recipeRefs,
    signals: graphDigest,
  };
}

function buildRecipeSuggestions(
  profile: Record<string, unknown>,
  graphDigest: Record<string, unknown>,
  profileSeed: ProfileSeedSummary | null
) {
  const triggered = asStringArray(graphDigest.triggered);
  const unlocked = asStringArray(graphDigest.unlocked);
  if (profileSeed && profileSeed.recipeRefs.length > 0) {
    return profileSeed.recipeRefs.map((ref, index) => ({
      id: ref.id,
      from: ref.from,
      to: ref.to,
      source: "declared-profile",
      rationale: artifactRecipeRationale(index, triggered, unlocked, ref.to),
      backedByArtifact: profileSeed.recipeArtifacts.find((recipe) => recipe.id === ref.id) ?? null,
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

function buildNotes(profileSeed: ProfileSeedSummary | null): string[] {
  const notes = [
    "Reactive state stays authoritative for computed values.",
    "Consequence graph explains downstream recompute and blocking.",
    "Exploratory graph explains unlocked choice frontiers.",
    "StepOrchestrator turns those graph outputs into a resumable authoring plan.",
  ];
  if (profileSeed) {
    notes.push("The plan starts from a declared profile artifact and proposes the concrete recipe chain that artifact already carries.");
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

function asProfileSeed(value: unknown): ProfileSeedSummary | null {
  const rec = asRecord(value);
  return rec.source === "artifact" ? (rec as unknown as ProfileSeedSummary) : null;
}

function asProfileArtifact(value: unknown): ProfileArtifact | null {
  const rec = asRecord(value);
  const payload = asRecord(rec.payload);
  if (rec.gik !== "0.1" || rec.type !== "profile" || typeof payload.id !== "string") return null;
  return rec as unknown as ProfileArtifact;
}

function asRecipeArtifacts(value: unknown): RecipeArtifactBase[] {
  return asArray(value)
    .map((item) => asRecord(item))
    .filter((item) => item.gik === "0.1" && item.type === "lowering-recipe") as unknown as RecipeArtifactBase[];
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