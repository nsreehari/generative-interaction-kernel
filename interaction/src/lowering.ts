// Layer 4 -> UI DSL: lower a Presentation Model (layout + regions) into a kernel document.
// A profile supplies a declarative lowering recipe mapping each region to one of its own
// capabilities. Regions with no mapping fall back to the region name as the capability,
// which the kernel renders as a graceful fallback node.

import {
  node,
  type Action,
  type DocNode,
  type DocumentPayload,
  type Json,
  type Lowering,
  type NodeOptions,
} from "../../kernel/src/index";
import { planPresentationWithRecipe, type PresentationContext, type PresentationSpec } from "./presentation";
import type {
  InteractionToPresentationRecipe,
  LoweringRecipe,
  PresentationToRuntimeRecipe,
  RecipeMatch,
  ResolvedProfile,
  RuntimeNodeRecipeFields,
} from "./profile";
import type { InteractionSpec } from "./interaction";

function readToken(path: string, tokens: Record<string, unknown>): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current == null || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, tokens);
}

function interpolateString(template: string, tokens: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_full, key: string) => {
    const value = readToken(key.trim(), tokens);
    return value == null ? "" : String(value);
  });
}

function resolveTemplatedValue(value: unknown, tokens: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    // An exact single-token string resolves to the token's native JSON value (number, boolean,
    // array, object, string) so typed recipe props survive; a token embedded in surrounding text
    // interpolates to a string.
    const exact = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
    if (exact) return readToken(exact[1].trim(), tokens);
    return interpolateString(value, tokens);
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

function buildRegionTokens(p: PresentationSpec, region: PresentationSpec["regions"][number]): Record<string, unknown> {
  return {
    interaction: p.source.interaction,
    source: {
      subject: p.source.subject,
      interaction: p.source.interaction,
    },
    presentation: {
      layout: p.layout,
      arrangement: p.arrangement,
    },
    region: {
      name: region.name,
      role: region.role,
      priority: region.priority,
      disclosure: region.disclosure,
      presentation: region.presentation,
      dataPath: p.source.data?.[region.name],
    },
  };
}

function buildContainerTokens(p: PresentationSpec): Record<string, unknown> {
  return {
    interaction: p.source.interaction,
    source: {
      subject: p.source.subject,
      interaction: p.source.interaction,
    },
    presentation: {
      layout: p.layout,
      arrangement: p.arrangement,
    },
  };
}

function matchesRecipe(match: RecipeMatch, facts: RecipeMatch): boolean {
  return Object.entries(match).every(([key, value]) => facts[key as keyof RecipeMatch] === value);
}

function runtimeFieldsToNodeOptions(
  source: RuntimeNodeRecipeFields | undefined,
  tokens: Record<string, unknown>
): NodeOptions {
  const opts: NodeOptions = {};
  if (!source) return opts;
  if (source.props) opts.props = resolveTemplatedValue(source.props, tokens) as Record<string, Json>;
  if (source.read) opts.read = resolveTemplatedValue(source.read, tokens) as Record<string, string>;
  if (source.readExpr) opts.readExpr = resolveTemplatedValue(source.readExpr, tokens) as Record<string, string>;
  if (source.on) opts.on = resolveTemplatedValue(source.on, tokens) as Record<string, Action[]>;
  return opts;
}

/**
 * The Presentation *Compiler*: lower a Presentation DSL (layout + enriched regions) into a kernel
 * document, using a profile's declarative recipe. Each region's hierarchy/disclosure/
 * presentation-type ride through as node props so a renderer can honor them.
 *
 * Recipe fields are emitted directly into the runtime document. The lowerer resolves recipe
 * templates against the current presentation/region and does not infer `read` or `on` edges.
 */
export function lowerPresentation(
  recipe: PresentationToRuntimeRecipe
): Lowering<PresentationSpec> {
  return (p: PresentationSpec): DocumentPayload => {
    const src = p.source;
    const children: DocNode[] = p.regions.map((region) => {
      const matchFacts: RecipeMatch = {
        region: region.name,
        role: region.role,
        priority: region.priority,
        disclosure: region.disclosure,
        presentation: region.presentation,
      };
      const matched = recipe.rules.find((rule) => matchesRecipe(rule.match, matchFacts))?.emit;
      const fallback = recipe.fallback;
      const capability = region.capability ?? matched?.capability ?? fallback?.capability ?? region.name;
      const tokens = buildRegionTokens(p, region);
      const fallbackOpts = runtimeFieldsToNodeOptions(fallback, tokens);
      const matchedOpts = runtimeFieldsToNodeOptions(matched, tokens);
      const props: Record<string, Json> = {
        ...((fallbackOpts.props ?? {}) as Record<string, Json>),
        ...((matchedOpts.props ?? {}) as Record<string, Json>),
        ...(region.props ?? {}),
      };
      const opts: NodeOptions = {
        ...fallbackOpts,
        ...matchedOpts,
        props,
      };
      if (region.read) opts.read = { ...(opts.read ?? {}), ...(resolveTemplatedValue(region.read, tokens) as Record<string, string>) };
      if (region.readExpr) {
        opts.readExpr = {
          ...(opts.readExpr ?? {}),
          ...(resolveTemplatedValue(region.readExpr, tokens) as Record<string, string>),
        };
      }
      if (region.on) opts.on = { ...(opts.on ?? {}), ...(resolveTemplatedValue(region.on, tokens) as Record<string, Action[]>) };
      return node(capability, `${region.name}-region`, opts);
    });
    return {
      root: node(recipe.container.capability, src.interaction, {
        ...runtimeFieldsToNodeOptions(recipe.container, buildContainerTokens(p)),
        children,
      }),
    };
  };
}

/**
 * The full upper pipeline as one call: Interaction + Context + Profile -> runtime-document. Each
 * profile stage runs through the executor registered for its layer-kind transition, so a profile
 * with additional layers works as long as an executor exists for every adjacent kind pair. Compose
 * with `lowerToDocument` to also get validate-before-commit.
 */
export type StageValue = InteractionSpec | PresentationSpec | DocumentPayload;

const STAGE_EXECUTORS: Record<
  string,
  (recipe: LoweringRecipe, input: StageValue, ctx: PresentationContext) => StageValue
> = {
  "interaction->presentation": (recipe, input, ctx) =>
    planPresentationWithRecipe(input as InteractionSpec, ctx, recipe as InteractionToPresentationRecipe),
  "presentation->runtime-document": (recipe, input) =>
    lowerPresentation(recipe as PresentationToRuntimeRecipe)(input as PresentationSpec),
};

/** One stage of a profile run: what entered the layer transition and what came out. */
export interface ProfileStageTrace {
  fromLayerId: string;
  toLayerId: string;
  fromKind: string;
  toKind: string;
  input: StageValue;
  output: StageValue;
}

/**
 * Run the profile and capture every stage's input and output. Same execution path as
 * {@link compileInteraction} (each stage goes through the executor registered for its layer-kind
 * transition), but returns the per-stage trace so tooling can show what any layer lowers into —
 * generically, without hardcoding a specific layer kind.
 */
export function traceProfile(
  profile: ResolvedProfile,
  spec: InteractionSpec,
  ctx: PresentationContext
): ProfileStageTrace[] {
  const trace: ProfileStageTrace[] = [];
  let value: StageValue = spec;
  for (const stage of profile.stages) {
    const key = `${stage.fromLayer.kind}->${stage.toLayer.kind}`;
    const execute = STAGE_EXECUTORS[key];
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

export function compileInteraction(
  spec: InteractionSpec,
  ctx: PresentationContext,
  profile: ResolvedProfile
): DocumentPayload {
  const trace = traceProfile(profile, spec, ctx);
  const last = trace[trace.length - 1];
  return (last ? last.output : spec) as DocumentPayload;
}
