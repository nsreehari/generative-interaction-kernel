import {
  node,
  type Action,
  type DocNode,
  type DocumentPayload,
  type Json,
  type Lowering,
  type NodeOptions,
} from "../../kernel/src/index";
import {
  matchesFacts,
  resolveTemplatedValue,
  type LayerContext,
  type RuntimeEmitter,
  type StageExecutor,
  type StageTrace,
} from "./profile-core";
import {
  planPresentationWithRecipe,
  planningRecipeOf,
  presentationRuntimeProgramEmit,
  presentationRuntimeProgramRules,
  recipeExecutor,
  runtimeRecipeOf,
  workflowProgramEmit,
  isWorkflowToInteractionRecipe,
  type InteractionSpec,
  type InteractionTaxonomy,
  type LayerRecipe,
  type PresentationRuntimeFacts,
  type PresentationSpec,
  type ResolvedLayerProfile,
  type RuntimeNodeRecipeFields,
  type WorkflowSpec,
} from "./genui";

export const EXECUTOR_PLAN_PRESENTATION = "plan-presentation";
export const EXECUTOR_LOWER_DOCUMENT = "lower-document";
export const EXECUTOR_COMPOSE_DOCUMENT = "compose-document";
export const EXECUTOR_SELECT_INTERACTION = "select-interaction";

type RuntimeEmitterNodeOptions<TNode> = {
  props?: Record<string, Json>;
  read?: Record<string, string>;
  readExpr?: Record<string, string>;
  on?: Record<string, Action[]>;
  children?: TNode[];
};

const kernelRuntimeEmitter: RuntimeEmitter<DocNode, DocumentPayload, NodeOptions> = {
  node,
  output: (root) => ({ root }),
};

export function lowerWorkflow(recipe: LayerRecipe): (workflow: WorkflowSpec) => InteractionSpec {
  if (!isWorkflowToInteractionRecipe(recipe)) {
    throw new Error(`Recipe '${recipe.id}' does not carry workflow-to-interaction data`);
  }
  return (workflow: WorkflowSpec): InteractionSpec => {
    const selected = workflowProgramEmit(recipe, "interaction", {
      workflow: workflow.workflow,
      subject: workflow.subject,
      interaction: workflow.interaction,
    });
    if (!selected?.interaction) {
      throw new Error(`Recipe '${recipe.id}' could not select an interaction for workflow '${workflow.workflow}'`);
    }
    return {
      interaction: selected.interaction,
      subject: selected.subject ?? workflow.subject,
      capabilities: selected.capabilities ?? workflow.capabilities,
      intent: workflow.intent,
      data: workflow.data,
      facetViews: workflow.facetViews,
    };
  };
}

function buildRegionTokens(presentation: PresentationSpec, region: PresentationSpec["regions"][number]): Record<string, unknown> {
  return {
    interaction: presentation.source.interaction,
    source: {
      subject: presentation.source.subject,
      interaction: presentation.source.interaction,
    },
    presentation: {
      layout: presentation.layout,
      arrangement: presentation.arrangement,
    },
    region: {
      name: region.name,
      role: region.role,
      priority: region.priority,
      disclosure: region.disclosure,
      presentation: region.presentation,
      dataPath: presentation.source.data?.[region.name],
    },
  };
}

function buildContainerTokens(presentation: PresentationSpec): Record<string, unknown> {
  return {
    interaction: presentation.source.interaction,
    source: {
      subject: presentation.source.subject,
      interaction: presentation.source.interaction,
    },
    presentation: {
      layout: presentation.layout,
      arrangement: presentation.arrangement,
    },
  };
}

function runtimeFieldsToNodeOptions<TNode>(
  source: RuntimeNodeRecipeFields | undefined,
  tokens: Record<string, unknown>
): RuntimeEmitterNodeOptions<TNode> {
  const options: RuntimeEmitterNodeOptions<TNode> = {};
  if (!source) return options;
  if (source.props) options.props = resolveTemplatedValue(source.props, tokens) as Record<string, Json>;
  if (source.read) options.read = resolveTemplatedValue(source.read, tokens) as Record<string, string>;
  if (source.readExpr) options.readExpr = resolveTemplatedValue(source.readExpr, tokens) as Record<string, string>;
  if (source.on) options.on = resolveTemplatedValue(source.on, tokens) as Record<string, Action[]>;
  return options;
}

export function lowerPresentationWithRuntimeEmitter<TNode, TOutput>(
  recipe: LayerRecipe,
  emitter: RuntimeEmitter<TNode, TOutput, RuntimeEmitterNodeOptions<TNode>>
): (presentation: PresentationSpec) => TOutput {
  const runtimeRecipe = runtimeRecipeOf(recipe);
  if (!runtimeRecipe) {
    throw new Error(`Recipe '${recipe.id}' does not carry runtime lowering data`);
  }
  return (presentation: PresentationSpec): TOutput => {
    const source = presentation.source;
    const containerFacts: PresentationRuntimeFacts = {
      interaction: source.interaction,
      subject: source.subject,
      layout: presentation.layout,
      arrangement: presentation.arrangement,
    };
    const container = presentationRuntimeProgramEmit(runtimeRecipe, "container", containerFacts);
    const children: TNode[] = presentation.regions.map((region) => {
      const matchFacts: PresentationRuntimeFacts = {
        ...containerFacts,
        region: region.name,
        role: region.role,
        priority: region.priority,
        disclosure: region.disclosure,
        presentation: region.presentation,
      };
      const regionRules = presentationRuntimeProgramRules(runtimeRecipe, "region");
      const fallback = [...regionRules].reverse().find((rule) => Object.keys(rule.match ?? {}).length === 0)?.emit;
      const matched = regionRules
        .filter((rule) => Object.keys(rule.match ?? {}).length > 0)
        .find((rule) => matchesFacts(rule.match, matchFacts))?.emit;
      const capability = region.capability ?? matched?.capability ?? fallback?.capability ?? region.name;
      const tokens = buildRegionTokens(presentation, region);
      const fallbackOptions = runtimeFieldsToNodeOptions<TNode>(fallback, tokens);
      const matchedOptions = runtimeFieldsToNodeOptions<TNode>(matched, tokens);
      const props: Record<string, Json> = {
        ...((fallbackOptions.props ?? {}) as Record<string, Json>),
        ...((matchedOptions.props ?? {}) as Record<string, Json>),
        ...(region.props ?? {}),
      };
      const options: RuntimeEmitterNodeOptions<TNode> = {
        ...fallbackOptions,
        ...matchedOptions,
        props,
      };
      if (region.read) {
        options.read = {
          ...(options.read ?? {}),
          ...(resolveTemplatedValue(region.read, tokens) as Record<string, string>),
        };
      }
      if (region.readExpr) {
        options.readExpr = {
          ...(options.readExpr ?? {}),
          ...(resolveTemplatedValue(region.readExpr, tokens) as Record<string, string>),
        };
      }
      if (region.on) {
        options.on = {
          ...(options.on ?? {}),
          ...(resolveTemplatedValue(region.on, tokens) as Record<string, Action[]>),
        };
      }
      return emitter.node(capability, `${region.name}-region`, options);
    });

    const root = emitter.node(container?.capability ?? source.interaction, source.interaction, {
      ...runtimeFieldsToNodeOptions<TNode>(container, buildContainerTokens(presentation)),
      children,
    });
    return emitter.output(root);
  };
}

export function lowerPresentation(recipe: LayerRecipe): Lowering<PresentationSpec> {
  return lowerPresentationWithRuntimeEmitter(recipe, kernelRuntimeEmitter);
}

export function defaultStageExecutors(): Record<string, StageExecutor<LayerRecipe>> {
  const requiredTaxonomy = (profile: ResolvedLayerProfile): InteractionTaxonomy => {
    const taxonomy = profile.resources.taxonomy as unknown;
    if (!taxonomy || typeof taxonomy !== "object" || Array.isArray(taxonomy)) {
      throw new Error(`Profile '${profile.artifact.payload.id}' is missing required 'taxonomy' resource`);
    }
    return taxonomy as InteractionTaxonomy;
  };

  return {
    [EXECUTOR_SELECT_INTERACTION]: (recipe, input) =>
      lowerWorkflow(recipe)(input as WorkflowSpec),
    [EXECUTOR_PLAN_PRESENTATION]: (recipe, input, ctx, profile) => {
      const planner = planningRecipeOf(recipe);
      if (!planner) throw new Error(`Recipe '${recipe.id}' does not carry presentation planning data`);
      return planPresentationWithRecipe(
        input as InteractionSpec,
        ctx,
        planner,
        requiredTaxonomy(profile)
      );
    },
    [EXECUTOR_LOWER_DOCUMENT]: (recipe, input) =>
      lowerPresentation(recipe)(input as PresentationSpec),
    [EXECUTOR_COMPOSE_DOCUMENT]: (recipe, input, ctx, profile) => {
      const planner = planningRecipeOf(recipe);
      if (!planner) throw new Error(`Recipe '${recipe.id}' does not carry presentation planning data`);
      const presentation = planPresentationWithRecipe(
        input as InteractionSpec,
        ctx,
        planner,
        requiredTaxonomy(profile)
      );
      return lowerPresentation(recipe)(presentation);
    },
  };
}

export function traceProfile(
  profile: ResolvedLayerProfile,
  seed: unknown,
  ctx: LayerContext,
  executors: Record<string, StageExecutor<LayerRecipe>> = defaultStageExecutors()
): StageTrace[] {
  const trace: StageTrace[] = [];
  let value: unknown = seed;
  for (const stage of profile.stages) {
    const key = recipeExecutor(stage.recipe);
    const execute = executors[key];
    if (!execute) {
      throw new Error(`Profile '${profile.artifact.payload.id}' has no executor '${key}' for stage '${stage.fromLayer.kind}->${stage.toLayer.kind}'`);
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

export function runProfile(
  profile: ResolvedLayerProfile,
  seed: unknown,
  ctx: LayerContext,
  executors: Record<string, StageExecutor<LayerRecipe>> = defaultStageExecutors()
): unknown {
  const trace = traceProfile(profile, seed, ctx, executors);
  const last = trace[trace.length - 1];
  return last ? last.output : seed;
}