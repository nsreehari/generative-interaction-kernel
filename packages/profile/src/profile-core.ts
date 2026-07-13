// Generic profile machinery (the kind *mechanism*, not GenUI kind *values*). A profile is a typed
// pipeline: layers carry a `kind` string, recipes connect two layer kinds, and each stage's
// transform is selected by the `${fromKind}->${toKind}` pair. Nothing here knows the concrete
// GenUI kinds (interaction/presentation/runtime-document) — those, their recipe shapes, and their
// executors live in the GenUI flavor package (@gik/profile-genui). Any profile family can reuse
// this core by supplying its own recipe types and registering executors.

import type { Json } from "../../../kernel/src/index";

export interface LayerDefinition {
  id: string;
  kind: string;
  schema?: string;
  description?: string;
}

export interface LoweringRecipeRef {
  id: string;
  from: string;
  to: string;
}

export interface Profile {
  id: string;
  kind: string;
  version: string;
  layers: LayerDefinition[];
  recipes: LoweringRecipeRef[];
  /** Optional declarative authoring surface: the tools this profile projects from its layers and
   *  recipes. Data only — the core never interprets it; a face engine materializes it into tools. */
  authoring?: ProfileAuthoring;
  metadata?: Record<string, Json>;
}

/** A declarative authoring-tool declaration: an operation over a declared layer (or a named
 *  projector), materialized into a concrete tool by a profile-family registry. Data only. */
export interface AuthoringToolDecl {
  id: string;
  op: "validate" | "describe" | "project";
  /** the layer this tool operates on (validate/describe). */
  layer?: string;
  description?: string;
  /** explicit input schema; a per-op default is used when omitted. */
  inputSchema?: Record<string, Json>;
  /** named semantic checks (registry.checks) run after structural schema validation. */
  checks?: string[];
  /** named projector (registry.projectors) for op:"project". */
  projector?: string;
  /** named describe hook (registry.describe); defaults to the layer id. */
  describe?: string;
  /** safe to expose to agents (drives the AgentFace projection). */
  agentSafe?: boolean;
}

export interface ProfileAuthoring {
  tools: AuthoringToolDecl[];
}

/** The uniform authoring report shape (JSON in, JSON out) every validator/check produces. */
export interface AuthoringReport {
  ok: boolean;
  errors: { detail: string }[];
  warnings: { code: string; node?: string; detail: string }[];
}

/** The profile-FAMILY code seam a declarative authoring surface binds to: the small, named,
 *  irreducible functions (structural validators, semantic checks, projectors, vocabulary
 *  describers) that cannot be pure JSON. Same shape as the lowering stage executors. A face engine
 *  (toolsFromProfile) maps a profile's `authoring.tools` declarations onto these. Generic — this
 *  contract knows nothing about any specific profile family. */
export interface AuthoringRegistry {
  /** structural validators keyed by `LayerDefinition.schema` (the schema ref). */
  validators?: Record<string, (args: Record<string, Json>) => AuthoringReport>;
  /** vocabulary describers keyed by `decl.describe ?? decl.layer`. */
  describe?: Record<string, () => Json>;
  /** named semantic checks keyed by name; return report parts to merge. */
  checks?: Record<string, (args: Record<string, Json>) => Partial<AuthoringReport>>;
  /** named projectors keyed by name for `op:"project"`. */
  projectors?: Record<string, (args: Record<string, Json>) => Json>;
}

export interface ProfileArtifact {
  gik: "0.1";
  type: "profile";
  payload: Profile;
}

/** The minimal shape every lowering recipe must satisfy: an id and the two layer kinds it connects. */
export interface RecipeBase {
  id: string;
  from: string;
  to: string;
}

export interface RecipeArtifactBase<TRecipe extends RecipeBase = RecipeBase> {
  gik: "0.1";
  type: "lowering-recipe";
  payload: TRecipe;
}

export interface ResolvedProfileStage<TRecipe extends RecipeBase = RecipeBase> {
  ref: LoweringRecipeRef;
  fromLayer: LayerDefinition;
  toLayer: LayerDefinition;
  recipe: TRecipe;
}

export interface ResolvedProfile<TRecipe extends RecipeBase = RecipeBase> {
  artifact: ProfileArtifact;
  layersById: Record<string, LayerDefinition>;
  recipesById: Record<string, TRecipe>;
  /** Ordered execution chain from the profile's source layer to its terminal layer. */
  stages: ResolvedProfileStage<TRecipe>[];
}

export interface RecipeLintWarning {
  code:
    | "duplicate-rule-match"
    | "unknown-template"
    | "unknown-capability"
    | "unreachable-fallback"
    | "missing-recipe-ref"
    | "unknown-layer-ref";
  detail: string;
}

/**
 * Resolve a profile artifact + its recipe artifacts into an ordered execution chain. The chain is
 * derived from the profile's declared layer graph — any number of layers connected by adjacent
 * lowering recipes — not a fixed pipeline. A profile of a different kind, or with extra layers,
 * resolves the same way as long as its recipes form one connected chain.
 */
export function resolveProfile<TRecipe extends RecipeBase>(
  artifact: ProfileArtifact,
  recipeArtifacts: readonly RecipeArtifactBase<TRecipe>[]
): ResolvedProfile<TRecipe> {
  const { id, layers, recipes } = artifact.payload;
  const layersById: Record<string, LayerDefinition> = Object.fromEntries(
    layers.map((layer) => [layer.id, layer])
  );
  const recipesById: Record<string, TRecipe> = Object.fromEntries(
    recipeArtifacts.map((recipe) => [recipe.payload.id, recipe.payload])
  );

  const outgoing = new Map<string, LoweringRecipeRef>();
  for (const ref of recipes) {
    if (!layersById[ref.from]) throw new Error(`Profile '${id}' references unknown layer '${ref.from}'`);
    if (!layersById[ref.to]) throw new Error(`Profile '${id}' references unknown layer '${ref.to}'`);
    if (!recipesById[ref.id]) throw new Error(`Profile '${id}' is missing recipe artifact '${ref.id}'`);
    if (outgoing.has(ref.from)) throw new Error(`Profile '${id}' has more than one recipe leaving layer '${ref.from}'`);
    outgoing.set(ref.from, ref);
  }

  const targets = new Set(recipes.map((ref) => ref.to));
  const sources = layers.filter((layer) => outgoing.has(layer.id) && !targets.has(layer.id));
  if (sources.length !== 1) {
    throw new Error(`Profile '${id}' must have exactly one source layer; found ${sources.length}`);
  }

  const stages: ResolvedProfileStage<TRecipe>[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined = sources[0].id;
  while (cursor !== undefined && outgoing.has(cursor)) {
    if (visited.has(cursor)) throw new Error(`Profile '${id}' has a cycle at layer '${cursor}'`);
    visited.add(cursor);
    const ref: LoweringRecipeRef = outgoing.get(cursor)!;
    const fromLayer = layersById[ref.from];
    const toLayer = layersById[ref.to];
    const recipe = recipesById[ref.id];
    if (recipe.from !== fromLayer.kind || recipe.to !== toLayer.kind) {
      throw new Error(
        `Recipe '${ref.id}' declares '${recipe.from} -> ${recipe.to}' but connects layer kinds '${fromLayer.kind} -> ${toLayer.kind}'`
      );
    }
    stages.push({ ref, fromLayer, toLayer, recipe });
    cursor = ref.to;
  }

  if (stages.length !== recipes.length) {
    throw new Error(`Profile '${id}' recipes do not form a single connected chain`);
  }

  return { artifact, layersById, recipesById, stages };
}

/** Look up the recipe connecting two layer *kinds* in a resolved profile's chain. */
export function recipeForKinds<TRecipe extends RecipeBase>(
  profile: ResolvedProfile<TRecipe>,
  fromKind: string,
  toKind: string
): TRecipe {
  const stage = profile.stages.find((s) => s.fromLayer.kind === fromKind && s.toLayer.kind === toKind);
  if (!stage) {
    throw new Error(`Profile '${profile.artifact.payload.id}' has no '${fromKind} -> ${toKind}' recipe`);
  }
  return stage.recipe;
}

export function lintProfileArtifacts(
  artifact: ProfileArtifact,
  recipeArtifacts: readonly RecipeArtifactBase[]
): RecipeLintWarning[] {
  const warnings: RecipeLintWarning[] = [];
  const layers = new Set(artifact.payload.layers.map((layer) => layer.id));
  const recipes = new Set(recipeArtifacts.map((recipe) => recipe.payload.id));
  for (const ref of artifact.payload.recipes) {
    if (!layers.has(ref.from)) {
      warnings.push({
        code: "unknown-layer-ref",
        detail: `recipe ref '${ref.id}' starts from unknown layer '${ref.from}'`,
      });
    }
    if (!layers.has(ref.to)) {
      warnings.push({
        code: "unknown-layer-ref",
        detail: `recipe ref '${ref.id}' targets unknown layer '${ref.to}'`,
      });
    }
    if (!recipes.has(ref.id)) {
      warnings.push({
        code: "missing-recipe-ref",
        detail: `profile '${artifact.payload.id}' does not have a matching recipe artifact for '${ref.id}'`,
      });
    }
  }
  return warnings;
}

// --- Open stage-executor registry ------------------------------------------------------------
// The generic driver: a profile family registers an executor per `${fromKind}->${toKind}`
// transition; `traceStages` walks the resolved chain, runs each stage's executor, and captures
// what entered and left every layer transition. Stage values are opaque here — the concrete
// per-kind value shapes belong to the profile family, not the platform.

export type StageExecutor<TRecipe extends RecipeBase = RecipeBase> = (
  recipe: TRecipe,
  input: unknown,
  ctx: unknown
) => unknown;

/** One stage of a profile run: what entered the layer transition and what came out. */
export interface StageTrace {
  fromLayerId: string;
  toLayerId: string;
  fromKind: string;
  toKind: string;
  input: unknown;
  output: unknown;
}

/**
 * Run a resolved profile through a registry of executors and capture every stage's input and
 * output. Each stage goes through the executor registered for its layer-kind transition, so a
 * profile with additional layers works as long as an executor exists for every adjacent kind pair.
 */
export function traceStages<TRecipe extends RecipeBase>(
  profile: ResolvedProfile<TRecipe>,
  seed: unknown,
  ctx: unknown,
  executors: Record<string, StageExecutor<TRecipe>>
): StageTrace[] {
  const trace: StageTrace[] = [];
  let value: unknown = seed;
  for (const stage of profile.stages) {
    const key = `${stage.fromLayer.kind}->${stage.toLayer.kind}`;
    const execute = executors[key];
    if (!execute) {
      throw new Error(`Profile '${profile.artifact.payload.id}' has no executor for stage '${key}'`);
    }
    const output = execute(stage.recipe, value, ctx);
    trace.push({
      fromLayerId: stage.fromLayer.id,
      toLayerId: stage.toLayer.id,
      fromKind: stage.fromLayer.kind,
      toKind: stage.toLayer.kind,
      input: value,
      output,
    });
    value = output;
  }
  return trace;
}
