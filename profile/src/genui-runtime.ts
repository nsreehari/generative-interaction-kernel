import {
  node,
  type Action,
  type DocNode,
  type ProjectedProgramDefinition,
  type Json,
  type ProgramLowering,
  type NodeOptions,
  type Reaction,
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
  type GenuiEvidenceRecorder,
  type LayerRecipe,
  type PresentationRuntimeFacts,
  type PresentationSpec,
  type ResolvedLayerProfile,
  type RuntimeNodeRecipeFields,
  type WorkflowSpec,
} from "./genui";

interface StageEvidenceSink {
  record(entry: import("./genui").GenuiDecisionEvidence): void;
}

export const EXECUTOR_PLAN_PRESENTATION = "plan-presentation";
export const EXECUTOR_LOWER_DOCUMENT = "lower-document";
export const EXECUTOR_COMPOSE_DOCUMENT = "compose-document";
export const EXECUTOR_SELECT_INTERACTION = "select-interaction";

type RuntimeEmitterNodeOptions<TNode> = {
  props?: Record<string, Json>;
  read?: Record<string, string>;
  readExpr?: Record<string, string>;
  gate?: string;
  on?: Record<string, Action[]>;
  react?: Reaction[];
  children?: TNode[];
};

const kernelRuntimeEmitter: RuntimeEmitter<DocNode, ProjectedProgramDefinition, NodeOptions> = {
  node,
  output: (root) => ({ root }),
};

function evidenceData(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

export function lowerWorkflow(recipe: LayerRecipe, record?: GenuiEvidenceRecorder): (workflow: WorkflowSpec) => InteractionSpec {
  if (!isWorkflowToInteractionRecipe(recipe)) {
    throw new Error(`Recipe '${recipe.id}' does not carry workflow-to-interaction data`);
  }
  return (workflow: WorkflowSpec): InteractionSpec => {
    const facts = {
      workflow: workflow.workflow,
      subject: workflow.subject,
      interaction: workflow.interaction,
    };
    const selected = workflowProgramEmit(recipe, "interaction", facts);
    const selectedRule = recipe.program.find((rule) => matchesFacts(rule.match, facts));
    record?.({
      kind: selectedRule ? "rule-selected" : "rule-missed",
      detail: selectedRule
        ? `Selected interaction '${selected?.interaction ?? ""}' for workflow '${workflow.workflow}'`
        : `No interaction rule selected for workflow '${workflow.workflow}'`,
      subject: `${recipe.id}#interaction:${workflow.workflow}`,
      data: evidenceData({ slot: "interaction", facts, match: selectedRule?.match, emit: selectedRule?.emit }),
    });
    if (!selected?.interaction) {
      throw new Error(`Recipe '${recipe.id}' could not select an interaction for workflow '${workflow.workflow}'`);
    }
    return {
      interaction: selected.interaction,
      subject: selected.subject ?? workflow.subject,
      capabilities: selected.capabilities ?? workflow.capabilities,
      parts: selected.parts,
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
      frame: presentation.frame,
    },
    region: {
      name: region.name,
      role: region.role,
      group: region.group,
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
      frame: presentation.frame,
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
  if (source.gate !== undefined) options.gate = resolveTemplatedValue(source.gate, tokens) as string;
  if (source.on) options.on = resolveTemplatedValue(source.on, tokens) as Record<string, Action[]>;
  if (source.react) options.react = resolveTemplatedValue(source.react, tokens) as Reaction[];
  return options;
}

function authoredRuntimeChildren<TNode>(
  source: RuntimeNodeRecipeFields | undefined,
  tokens: Record<string, unknown>,
  emitter: RuntimeEmitter<TNode, unknown, RuntimeEmitterNodeOptions<TNode>>,
  parentId: string
): TNode[] {
  return (source?.children ?? []).map((child, index) => {
    if (!child.capability) {
      throw new Error(`Runtime recipe child '${parentId}[${index}]' is missing a capability`);
    }
    const id = child.id ?? `${parentId}-child-${index + 1}`;
    const options = runtimeFieldsToNodeOptions<TNode>(child, tokens);
    const children = authoredRuntimeChildren(child, tokens, emitter, id);
    if (children.length > 0) options.children = children;
    return emitter.node(child.capability, id, options);
  });
}

export function lowerPresentationWithRuntimeEmitter<TNode, TOutput>(
  recipe: LayerRecipe,
  emitter: RuntimeEmitter<TNode, TOutput, RuntimeEmitterNodeOptions<TNode>>,
  record?: GenuiEvidenceRecorder
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
      frame: presentation.frame,
    };
    const container = presentationRuntimeProgramEmit(runtimeRecipe, "container", containerFacts);
    const containerRule = presentationRuntimeProgramRules(runtimeRecipe, "container")
      .find((rule) => matchesFacts(rule.match, containerFacts));
    record?.({
      kind: containerRule ? "rule-selected" : "rule-missed",
      detail: containerRule ? "Selected runtime container rule" : "No runtime container rule selected",
      subject: `${runtimeRecipe.id}#container`,
      data: evidenceData({ slot: "container", facts: containerFacts, match: containerRule?.match, emit: containerRule?.emit }),
    });
    const containerTokens = buildContainerTokens(presentation);
    const children: TNode[] = presentation.regions.filter((region) => region.materialize !== false).map((region) => {
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
      const matchedRule = regionRules
        .filter((rule) => Object.keys(rule.match ?? {}).length > 0)
        .find((rule) => matchesFacts(rule.match, matchFacts));
      const fallbackRule = [...regionRules].reverse()
        .find((rule) => Object.keys(rule.match ?? {}).length === 0);
      record?.({
        kind: matchedRule ? "rule-selected" : "fallback-selected",
        detail: matchedRule
          ? `Selected runtime region rule for '${region.name}'`
          : `Selected runtime fallback for '${region.name}'`,
        subject: `${runtimeRecipe.id}#region:${region.name}`,
        data: evidenceData({
          slot: "region",
          facts: matchFacts,
          match: matchedRule?.match ?? fallbackRule?.match,
          emit: matchedRule?.emit ?? fallbackRule?.emit,
        }),
      });
      const capability = region.capability ?? matched?.capability ?? fallback?.capability ?? region.name;
      record?.({
        kind: "capability-emitted",
        detail: `Emitted capability '${capability}' for region '${region.name}'`,
        subject: `${runtimeRecipe.id}#region:${region.name}`,
        data: {
          capability,
          source: region.capability
            ? "interaction"
            : matched?.capability
              ? "matched-rule"
              : fallback?.capability
                ? "fallback"
                : "region-name",
        },
      });
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

    const rootId = container?.id ?? source.interaction;
    record?.({
      kind: "capability-emitted",
      detail: `Emitted root capability '${container?.capability ?? source.interaction}'`,
      subject: `${runtimeRecipe.id}#container`,
      data: { capability: container?.capability ?? source.interaction, id: rootId },
    });
    const root = emitter.node(container?.capability ?? source.interaction, rootId, {
      ...runtimeFieldsToNodeOptions<TNode>(container, containerTokens),
      children: [
        ...authoredRuntimeChildren(container, containerTokens, emitter as RuntimeEmitter<TNode, unknown, RuntimeEmitterNodeOptions<TNode>>, rootId),
        ...children,
      ],
    });
    return emitter.output(root);
  };
}

export function lowerPresentation(recipe: LayerRecipe, record?: GenuiEvidenceRecorder): ProgramLowering<PresentationSpec> {
  return lowerPresentationWithRuntimeEmitter(recipe, kernelRuntimeEmitter, record);
}

function recorderFor(evidence?: StageEvidenceSink): GenuiEvidenceRecorder | undefined {
  return evidence ? (entry) => evidence.record(entry) : undefined;
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
    [EXECUTOR_SELECT_INTERACTION]: (recipe, input, _ctx, _profile, evidence?: StageEvidenceSink) =>
      lowerWorkflow(recipe, recorderFor(evidence))(input as WorkflowSpec),
    [EXECUTOR_PLAN_PRESENTATION]: (recipe, input, ctx, profile, evidence?: StageEvidenceSink) => {
      const planner = planningRecipeOf(recipe);
      if (!planner) throw new Error(`Recipe '${recipe.id}' does not carry presentation planning data`);
      evidence?.record({
        kind: "resource-read",
        detail: "Read resolved taxonomy resource for presentation planning",
        subject: `${recipe.id}#resource:taxonomy`,
        data: { resource: "taxonomy" },
      });
      return planPresentationWithRecipe(
        input as InteractionSpec,
        ctx,
        planner,
        requiredTaxonomy(profile),
        recorderFor(evidence)
      );
    },
    [EXECUTOR_LOWER_DOCUMENT]: (recipe, input, _ctx, _profile, evidence?: StageEvidenceSink) =>
      lowerPresentation(recipe, recorderFor(evidence))(input as PresentationSpec),
    [EXECUTOR_COMPOSE_DOCUMENT]: (recipe, input, ctx, profile, evidence?: StageEvidenceSink) => {
      const planner = planningRecipeOf(recipe);
      if (!planner) throw new Error(`Recipe '${recipe.id}' does not carry presentation planning data`);
      evidence?.record({
        kind: "resource-read",
        detail: "Read resolved taxonomy resource for composed lowering",
        subject: `${recipe.id}#resource:taxonomy`,
        data: { resource: "taxonomy" },
      });
      const record = recorderFor(evidence);
      const presentation = planPresentationWithRecipe(
        input as InteractionSpec,
        ctx,
        planner,
        requiredTaxonomy(profile),
        record
      );
      return lowerPresentation(recipe, record)(presentation);
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