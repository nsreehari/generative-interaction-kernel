// Generic profile machinery (the kind *mechanism*, not GenUI kind *values*). A profile is a typed
// pipeline: layers carry a `kind` string, recipes connect two layer kinds, and each stage's
// transform is selected by the `${fromKind}->${toKind}` pair. Nothing here knows the concrete
// GenUI kinds (interaction/presentation/runtime-document) — those, their recipe shapes, and their
// executors live in the GenUI flavor package (@gik/profile-genui). Any profile family can reuse
// this core by supplying its own recipe types and registering executors.

import type {
  ExternalsSpec,
  Json,
  ManifestPayload,
  ServiceDeclaration,
  ServiceRequirement,
} from "../../kernel/src/index";

export interface ProfileRuntime {
  expression?: string;
  namespaces?: string[];
  contexts?: string[];
  actions?: string[];
  capabilities: ManifestPayload["capabilities"];
  externals?: Omit<ExternalsSpec, "services">;
  state?: Record<string, Json>;
}

/** A generic per-run context bag threaded through every profile stage. Profile families may
 *  document preferred keys, but the core treats context as plain data rather than a hardcoded,
 *  layer-specific structure. */
export type LayerContext = Record<string, unknown>;

export interface LayerDefinition {
  id: string;
  kind: string;
  /** Optional structural schema ref for this layer's payload/artifact. Profiles declare it per
   *  layer (for example `genui/presentation.schema.json` on a presentation layer); generic hosts
   *  can use the ref to pick the appropriate family validator without hardcoding layer ids. */
  schema?: string;
  description?: string;
  /** Optional declarative authoring surface for THIS layer's input: a `ui:form` FormSchema
    *  (`{ properties, required?, validators? }`, data only) describing the fields a human fills to
   *  produce a value for the stage that leaves this layer. The core never interprets it; a host
   *  renders it into a form. Distinct from `kind` (which binds the layer to its transform code):
   *  this is the human authoring surface, `kind` is the engine routing key. */
  input?: Record<string, Json>;
}

export interface LoweringRecipeRef {
  id: string;
  from: string;
  to: string;
}

/** A declared reference to a named data resource a profile depends on. Either the data is carried
 *  inline in the profile (`inline`), or it is named by a family/host-resolvable reference (`$ref`,
 *  e.g. `"genui:taxonomy"`) that a {@link ResourceResolver} turns into data. Data only — the core
 *  never interprets a resource's shape; a profile family decides what each named resource means. */
export type ResourceRef = { inline: Json } | { $ref: string };

/** Resolves a profile resource `$ref` into its data. This is the ONE environment-specific seam of
 *  the resource meta-loader: byte/module resolution (bundler import map, fetch, fs, a family's
 *  built-in defaults) lives here, injected by the host or profile family, so the core stays pure. */
export type ResourceResolver = (ref: string, name: string) => Json;

export interface Profile {
  id: string;
  kind: string;
  version: string;
  "profile-template"?: string;
  layers: LayerDefinition[];
  recipes: LoweringRecipeRef[];
  /** Optional declarative authoring surface for the shared run-context bag threaded across all
   *  layers. Data only (typically a `ui:form` FormSchema); the core never interprets it. */
  context?: Record<string, Json>;
  /** Optional named data resources this profile depends on (e.g. a `taxonomy`). Declared as data;
   *  the generic resource meta-loader ({@link resolveResources}) resolves each into concrete JSON,
   *  attaches it to {@link ResolvedProfile.resources}, and threads it into stage executors — so a
   *  profile family reads pre-loaded data instead of importing it, and a profile can override a
   *  family default by declaring its own. */
  resources?: Record<string, ResourceRef>;
  /** Logical external services required by this semantic profile/Blueprint. Lowering carries the
   *  same data into `manifest.externals.services`; hosts supply all physical provider bindings. */
  services?: Record<string, ServiceRequirement | ServiceDeclaration>;
  /** Non-derived runtime envelope and initial state. The terminal lowering stage supplies the
   *  document; the Face combines it with this declaration and the Profile-owned services. */
  runtime?: ProfileRuntime;
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
  /** explicit inline `ui:form` schema; a per-op default is used when omitted. */
  inputSchema?: Record<string, Json>;
  /** named semantic checks (registry.checks) run after structural schema validation. */
  checks?: string[];
  /** named projector (registry.projectors) for op:"project". */
  projector?: string;
  /** declarative projector expression evaluated over the tool args for op:"project". */
  projectExpression?: string;
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

/** A structural validator keyed by `LayerDefinition.schema`. */
export type StructuralValidator = (args: Record<string, Json>) => AuthoringReport;

/** The profile-FAMILY code seam a declarative authoring surface binds to: the small, named,
 *  irreducible functions (structural validators, semantic checks, projectors, vocabulary
 *  describers) that cannot be pure JSON. Same shape as the lowering stage executors. A face engine
 *  (toolsFromProfile) maps a profile's `authoring.tools` declarations onto these. Generic — this
 *  contract knows nothing about any specific profile family. */
export interface AuthoringRegistry {
  /** structural validators keyed by `LayerDefinition.schema` (the schema ref). */
  validators?: Record<string, StructuralValidator>;
  /** vocabulary describers keyed by `decl.describe ?? decl.layer`. */
  describe?: Record<string, () => Json>;
  /** named semantic checks keyed by name; return report parts to merge. */
  checks?: Record<string, (args: Record<string, Json>) => Partial<AuthoringReport>>;
  /** named projectors keyed by name for `op:"project"`. */
  projectors?: Record<string, (args: Record<string, Json>) => Json>;
}

/** Resolve the structural validator declared by a layer's `schema` ref, if any. The profile core
 *  owns the mapping from a layer declaration to a validator key; hosts only supply the registry. */
export function structuralValidatorForLayer(
  layer: LayerDefinition | undefined,
  registry?: Pick<AuthoringRegistry, "validators">
): StructuralValidator | undefined {
  if (!layer?.schema) return undefined;
  return registry?.validators?.[layer.schema];
}

export interface ProfileArtifact {
  gik: "0.1";
  type: "profile";
  payload: Profile;
}

export interface ProfileTemplate {
  id: string;
  profileKind?: string;
  description?: string;
  files?: Record<string, string>;
  defaultResources?: Record<string, ResourceRef>;
}

export interface ProfileTemplateArtifact {
  gik: "0.1";
  type: "profile-template";
  payload: ProfileTemplate;
}

/** Resolves a profile template id (e.g. `genui`) into its declarative template artifact. */
export type ProfileTemplateResolver = (id: string) => ProfileTemplateArtifact;

/** The minimal shape every lowering recipe must satisfy: an id and the two layer kinds it connects. */
export interface RecipeBase {
  id: string;
  from: string;
  to: string;
  metadata?: Record<string, Json>;
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
  /** Named data resources resolved from the profile's `resources` declaration (empty when none).
   *  Available to stage executors via the resolved profile they receive. */
  resources: Record<string, Json>;
  /** Logical service requirements preserved for lowering into runtime manifests. */
  services: Record<string, ServiceRequirement | ServiceDeclaration>;
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
 * Merge a profile artifact with its referenced profile-template defaults. The profile remains the
 * owner of its declared structure; template defaults currently flow only through resources, with
 * profile-declared resources overriding template defaults by name.
 */
export function applyProfileTemplate(
  artifact: ProfileArtifact,
  resolveTemplate?: ProfileTemplateResolver
): ProfileArtifact {
  const rawPayload = (artifact as unknown as { payload?: Record<string, unknown> } | null)?.payload;
  const templateId = typeof rawPayload?.["profile-template"] === "string" ? rawPayload["profile-template"] : undefined;
  if (!templateId) return artifact;
  if (!resolveTemplate) return artifact;

  const template = resolveTemplate(templateId);
  if (template.type !== "profile-template") {
    throw new Error(`Profile template '${templateId}' must be a 'profile-template' artifact`);
  }
  if (template.payload.id !== templateId) {
    throw new Error(
      `Profile template resolver returned '${template.payload.id}' for requested template '${templateId}'`
    );
  }
  if (template.payload.profileKind && template.payload.profileKind !== artifact.payload.kind) {
    throw new Error(
      `Profile '${artifact.payload.id}' kind '${artifact.payload.kind}' is incompatible with template '${templateId}' kind '${template.payload.profileKind}'`
    );
  }
  const mergedResources = {
    ...(template.payload.defaultResources ?? {}),
    ...(artifact.payload.resources ?? {}),
  };

  return {
    ...artifact,
    payload: {
      ...artifact.payload,
      resources: Object.keys(mergedResources).length > 0 ? mergedResources : undefined,
    },
  };
}

/**
 * Resolve a profile artifact + its recipe artifacts into an ordered execution chain. The chain is
 * derived from the profile's declared layer graph — any number of layers connected by adjacent
 * lowering recipes — not a fixed pipeline. A profile of a different kind, or with extra layers,
 * resolves the same way as long as its recipes form one connected chain.
 */
export function resolveProfile<TRecipe extends RecipeBase>(
  artifact: ProfileArtifact,
  recipeArtifacts: readonly RecipeArtifactBase<TRecipe>[],
  resolveResource?: ResourceResolver
): ResolvedProfile<TRecipe> {
  const { id, layers, recipes } = artifact.payload;
  const layersById: Record<string, LayerDefinition> = Object.fromEntries(
    layers.map((layer) => [layer.id, layer])
  );
  const recipesById: Record<string, TRecipe> = Object.fromEntries(
    recipeArtifacts.map((recipe) => [recipe.payload.id, recipe.payload])
  );

  if (recipes.length === 0) {
    if (layers.length !== 1) {
      throw new Error(`Profile '${id}' with no recipes must have exactly one terminal layer; found ${layers.length}`);
    }
    const resources = resolveResources(artifact, resolveResource);
    const services = structuredClone(artifact.payload.services ?? {});
    return { artifact, layersById, recipesById, stages: [], resources, services };
  }

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

  const resources = resolveResources(artifact, resolveResource);
  const services = structuredClone(artifact.payload.services ?? {});
  return { artifact, layersById, recipesById, stages, resources, services };
}

/**
 * The generic resource meta-loader. Walks a profile's declared `resources`, turning each
 * {@link ResourceRef} into concrete JSON: `inline` refs carry their own data; `$ref` refs are
 * handed to the supplied {@link ResourceResolver} (the only environment-specific seam). Returns the
 * resolved name→data map that gets attached to the {@link ResolvedProfile}. Profiles that declare
 * no resources resolve to an empty map with no resolver required.
 */
export function resolveResources(
  artifact: ProfileArtifact,
  resolveResource?: ResourceResolver
): Record<string, Json> {
  const declared = artifact.payload.resources;
  if (!declared) return {};
  const out: Record<string, Json> = {};
  for (const [name, ref] of Object.entries(declared)) {
    if ("inline" in ref) {
      out[name] = ref.inline;
    } else {
      if (!resolveResource) {
        throw new Error(
          `Profile '${artifact.payload.id}' resource '${name}' needs a resolver for $ref '${ref.$ref}'`
        );
      }
      out[name] = resolveResource(ref.$ref, name);
    }
  }
  return out;
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

// --- Generic sync template + match primitives ------------------------------------------------
// Pure, domain-neutral helpers shared by profile-family lowering/planning code: dotted-path token
// reads, `{{token}}` string interpolation, exact-token native-value resolution, and record-equality
// matching over rule facts. No expression engine is involved — recipes stay data, and these
// compile-time transforms are plain synchronous JavaScript (ADR-0039: platform JSONata is pure and
// a single canonical engine version is kept; these primitives deliberately do not call it).

/** A flat bag of facts a recipe rule's `match` is tested against (region role, surface, etc.). */
export type RuleFacts = Record<string, unknown>;

/** A generic matched rule: when `match` satisfies the current facts, emit `emit`. Profile families
 *  specialize only the emit payload shape; the match/emit envelope itself is generic core
 *  machinery. */
export interface EmitRule<TMatch extends RuleFacts = RuleFacts, TEmit = unknown> {
  match: TMatch;
  emit: TEmit;
}

/** A generic stage-program rule: a named decision slot (`template`, `priority`, `presentation`,
 *  etc.), its match facts, and the value it emits when matched. */
export interface ProgramRule<
  TSlot extends string = string,
  TMatch extends RuleFacts = RuleFacts,
  TEmit = unknown,
> extends EmitRule<TMatch, TEmit> {
  slot: TSlot;
}

/** Read a dotted path (e.g. `"region.role"`) out of a token tree. Returns `undefined` at the first
 *  missing or non-object segment. */
export function readToken(path: string, tokens: Record<string, unknown>): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current == null || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, tokens);
}

/** Interpolate `{{ dotted.path }}` tokens in a string; a missing/nullish token renders as empty. */
export function renderTemplate(template: string, tokens: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_full, key: string) => {
    const value = readToken(key.trim(), tokens);
    return value == null ? "" : String(value);
  });
}

/**
 * Resolve every template in a JSON value against `tokens`. An *exact* single-token string
 * (`"{{ x }}"`) yields the token's NATIVE value (number/boolean/array/object preserved) so typed
 * recipe props survive; a token embedded in surrounding text interpolates to a string. Arrays and
 * objects recurse; object entries that resolve to `undefined` are dropped.
 */
export function resolveTemplatedValue(value: unknown, tokens: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    const exact = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
    if (exact) return readToken(exact[1].trim(), tokens);
    return renderTemplate(value, tokens);
  }
  if (Array.isArray(value)) return value.map((item) => resolveTemplatedValue(item, tokens));
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, resolveTemplatedValue(entry, tokens)] as const)
      .filter(([, entry]) => entry !== undefined);
    return Object.fromEntries(entries);
  }
  return value;
}

/** True when every field declared in `match` strictly equals the corresponding fact. Absent facts
 *  never satisfy a declared field. This record-equality test is the basis of recipe rule matching. */
export function matchesFacts(match: RuleFacts, facts: RuleFacts): boolean {
  return Object.entries(match).every(([key, value]) => facts[key] === value);
}

/** The first rule whose `match` satisfies {@link matchesFacts} against `facts`, or `undefined`. */
export function firstMatchingRule<T extends { match: RuleFacts }>(
  rules: readonly T[],
  facts: RuleFacts
): T | undefined {
  return rules.find((rule) => matchesFacts(rule.match, facts));
}

/** The emitted payload from the first matching rule, or `undefined` when none match. */
export function matchEmit<TMatch extends RuleFacts, TEmit>(
  rules: readonly EmitRule<TMatch, TEmit>[],
  facts: TMatch
): TEmit | undefined {
  return firstMatchingRule(rules, facts)?.emit;
}

/** All program rules for one decision slot. */
export function rulesForSlot<TRule extends { slot: string }, TSlot extends TRule["slot"]>(
  rules: readonly TRule[],
  slot: TSlot
): Extract<TRule, { slot: TSlot }>[] {
  return rules.filter((rule): rule is Extract<TRule, { slot: TSlot }> => rule.slot === slot);
}

/** The emitted payload from the first matching program rule for one slot. */
export function matchProgramEmit<TRule extends ProgramRule<string, RuleFacts, unknown>, TSlot extends TRule["slot"]>(
  rules: readonly TRule[],
  slot: TSlot,
  facts: Extract<TRule, { slot: TSlot }>["match"]
): Extract<TRule, { slot: TSlot }>["emit"] | undefined {
  return firstMatchingRule(rulesForSlot(rules, slot), facts)?.emit;
}

/** Like {@link matchProgramEmit}, but throws the caller-supplied error when no rule matches. */
export function requireProgramEmit<TRule extends ProgramRule<string, RuleFacts, unknown>, TSlot extends TRule["slot"]>(
  rules: readonly TRule[],
  slot: TSlot,
  facts: Extract<TRule, { slot: TSlot }>["match"],
  error: string
): Extract<TRule, { slot: TSlot }>["emit"] {
  const emit = matchProgramEmit(rules, slot, facts);
  if (emit === undefined) throw new Error(error);
  return emit;
}

/** One item after stable rank ordering: keeps the original index as a deterministic tiebreaker. */
export interface RankedItem<T> {
  item: T;
  index: number;
  rank: number;
}

/** Stable rank ordering used by profile-family planners: lower rank wins, original index breaks ties. */
export function orderByRank<T>(
  items: readonly T[],
  rankOf: (item: T, index: number) => number
): RankedItem<T>[] {
  return items
    .map((item, index) => ({ item, index, rank: rankOf(item, index) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
}

/**
 * Apply a simple cap to an already ordered list. When `preserveRequired` is true, required items
 * are kept ahead of optional ones and never dropped solely because they fell beyond `maxItems`.
 */
export function capOrderedItems<T>(
  ordered: readonly RankedItem<T>[],
  maxItems: number | undefined,
  preserveRequired: boolean,
  isRequired: (item: T) => boolean
): RankedItem<T>[] {
  if (maxItems == null || ordered.length <= maxItems) return [...ordered];
  if (!preserveRequired) return ordered.slice(0, maxItems);

  const required = ordered.filter(({ item }) => isRequired(item));
  const optional = ordered.filter(({ item }) => !isRequired(item));
  return [...required, ...optional].slice(0, Math.max(maxItems, required.length));
}

// --- Open stage-executor registry ------------------------------------------------------------
// The generic driver: a profile family registers an executor per `${fromKind}->${toKind}`
// transition; `traceStages` walks the resolved chain, runs each stage's executor, and captures
// what entered and left every layer transition. Stage values are opaque here — the concrete
// per-kind value shapes belong to the profile family, not the platform.

export type StageExecutor<TRecipe extends RecipeBase = RecipeBase> = (
  recipe: TRecipe,
  input: unknown,
  ctx: LayerContext,
  profile: ResolvedProfile<TRecipe>
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

/** A tiny adapter seam between a profile-family runtime lowering plan and a concrete runtime
 *  representation. The family computes capabilities + options; the emitter decides how those become
 *  actual runtime nodes/documents. */
export interface RuntimeEmitter<TNode, TOutput, TNodeOptions = unknown> {
  node(capability: string, id: string, options: TNodeOptions): TNode;
  output(root: TNode): TOutput;
}

/**
 * Run a resolved profile through a registry of executors and capture every stage's input and
 * output. Each stage goes through the executor registered for its layer-kind transition, so a
 * profile with additional layers works as long as an executor exists for every adjacent kind pair.
 */
export function traceStages<TRecipe extends RecipeBase>(
  profile: ResolvedProfile<TRecipe>,
  seed: unknown,
  ctx: LayerContext,
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
    const output = execute(stage.recipe, value, ctx, profile);
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
