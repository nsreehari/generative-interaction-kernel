import type {
  AgentCapabilityManifest,
  AgentLifecycleOps,
  AgentLifecycleProfileOperation,
  AgentOperationManifest,
  AgentTool,
  AuthoredLifecycleProfileMaterial,
  BlueprintLifecycleMaterialSource,
  BlueprintLifecycleProfileKind,
  JsonSchema,
  MaybePromise,
} from "./types";
import { STANDARD_OPERATIONS, STATIC_AUTHORING_OPERATIONS } from "./types";
import { defineBlueprintLifecycleProfile } from "./tools";

export interface BlueprintUseSource extends BlueprintLifecycleMaterialSource {
  readonly payload: BlueprintLifecycleMaterialSource["payload"] & {
    readonly id: string;
    readonly kind: string;
    readonly version: string;
    readonly structureMode?: string;
    readonly structurePolicy?: unknown;
    readonly serviceTiers?: readonly { readonly id?: string; readonly kind?: string; readonly description?: string }[];
    readonly projectionTiers?: readonly {
      readonly id?: string;
      readonly kind?: string;
      readonly description?: string;
      readonly capabilities?: readonly string[];
    }[];
    readonly serviceRecipes?: readonly { readonly id?: string; readonly from?: string; readonly to?: string }[];
    readonly projectionRecipes?: readonly { readonly id?: string; readonly from?: string; readonly to?: string }[];
    readonly cells?: Readonly<Record<string, {
      readonly id?: string;
      readonly inputs?: readonly unknown[];
      readonly outputs?: readonly unknown[];
      readonly behavior?: { readonly on?: Readonly<Record<string, readonly { readonly do?: string }[]>> };
      readonly sources?: readonly unknown[];
      readonly potentialViews?: Readonly<Record<string, { readonly capability?: string }>>;
    }>>;
    readonly services?: Readonly<Record<string, unknown>>;
    readonly presentation?: {
      readonly allowedCapabilities: readonly (string | { readonly tier: string })[];
    };
    readonly runtime?: {
      readonly externals?: unknown;
      readonly state?: Readonly<Record<string, unknown>>;
    };
  };
}

export interface BlueprintUseSchemas {
  readonly discover: JsonSchema;
  readonly target: JsonSchema;
  readonly intent: JsonSchema;
  readonly proposal: JsonSchema;
}

export interface BlueprintUseHost<TDiscover = unknown, TTarget = unknown, TIntent = unknown, TProposal = unknown> {
  discover?(input: TDiscover): MaybePromise<unknown>;
  inspect?(target: TTarget): MaybePromise<unknown>;
  validate?(intent: TIntent): MaybePromise<unknown>;
  simulate?(intent: TIntent): MaybePromise<unknown>;
  preflight?(intent: TIntent): MaybePromise<unknown>;
  read_in_progress_proposal?(input: unknown, context?: import("./types").AgentToolExecutionContext): MaybePromise<TProposal | undefined>;
  set_in_progress_proposal?(intent: TIntent, context?: import("./types").AgentToolExecutionContext): MaybePromise<TProposal>;
}

export interface BlueprintUseOptions<TDiscover = unknown, TTarget = unknown, TIntent = unknown, TProposal = unknown> {
  readonly blueprint: BlueprintUseSource;
  readonly schemas: BlueprintUseSchemas;
  readonly host: BlueprintUseHost<TDiscover, TTarget, TIntent, TProposal>;
}

export interface BlueprintProfileOptions<TDiscover = unknown, TTarget = unknown, TIntent = unknown, TProposal = unknown>
  extends BlueprintUseOptions<TDiscover, TTarget, TIntent, TProposal> {
  readonly profile: BlueprintLifecycleProfileKind;
}

export interface BlueprintLifecycleManifestOptions {
  readonly blueprint: BlueprintUseSource;
  readonly schemas: BlueprintUseSchemas;
  readonly profile: BlueprintLifecycleProfileKind;
}

function operation(description: string, inputSchema: JsonSchema): AgentOperationManifest {
  return { description, inputSchema };
}

export function resolveLifecycleProfileOperations(
  authored: AuthoredLifecycleProfileMaterial,
): readonly AgentLifecycleProfileOperation[] {
  if (authored.operations) return authored.operations;
  if (authored.operationPreset === "static-authoring") return STATIC_AUTHORING_OPERATIONS;
  if (authored.operationPreset === "standard") return STANDARD_OPERATIONS;
  throw new Error(`Lifecycle profile '${authored.id}' must declare operationPreset or operations`);
}

export function createBlueprintUseLifecycle<
  TDiscover = unknown,
  TTarget = unknown,
  TIntent = unknown,
  TProposal = unknown,
>(options: BlueprintUseOptions<TDiscover, TTarget, TIntent, TProposal>): AgentLifecycleOps<TDiscover, TTarget, TIntent, TProposal> {
  return createBlueprintLifecycle({ ...options, profile: "use" });
}

export function createBlueprintLifecycle<
  TDiscover = unknown,
  TTarget = unknown,
  TIntent = unknown,
  TProposal = unknown,
>(options: BlueprintProfileOptions<TDiscover, TTarget, TIntent, TProposal>): AgentLifecycleOps<TDiscover, TTarget, TIntent, TProposal> {
  const manifest = createBlueprintLifecycleManifest(options);
  const lifecycle: AgentLifecycleOps<TDiscover, TTarget, TIntent, TProposal> = {
    manifest: () => manifest,
  };
  for (const operationName of Object.keys(manifest.operations) as AgentLifecycleProfileOperation[]) {
    if (operationName === "describe") {
      lifecycle.describe = () => describeBlueprint(options.blueprint, options.profile);
      continue;
    }
    const handler = options.host[operationName];
    if (!handler) throw new Error(`Lifecycle profile '${manifest.id}' selects '${operationName}' without a host handler`);
    switch (operationName) {
      case "discover": lifecycle.discover = handler as BlueprintUseHost<TDiscover>["discover"]; break;
      case "inspect": lifecycle.inspect = handler as BlueprintUseHost<unknown, TTarget>["inspect"]; break;
      case "validate": lifecycle.validate = handler as BlueprintUseHost<unknown, unknown, TIntent>["validate"]; break;
      case "simulate": lifecycle.simulate = handler as BlueprintUseHost<unknown, unknown, TIntent>["simulate"]; break;
      case "preflight": lifecycle.preflight = handler as BlueprintUseHost<unknown, unknown, TIntent>["preflight"]; break;
      case "read_in_progress_proposal": lifecycle.read_in_progress_proposal = handler as BlueprintUseHost<unknown, unknown, TIntent, TProposal>["read_in_progress_proposal"]; break;
      case "set_in_progress_proposal": lifecycle.set_in_progress_proposal = handler as BlueprintUseHost<unknown, unknown, TIntent, TProposal>["set_in_progress_proposal"]; break;
    }
  }
  return lifecycle;
}

export function createBlueprintLifecycleManifest(
  options: BlueprintLifecycleManifestOptions,
): AgentCapabilityManifest {
  const authored = options.blueprint.payload.agentLifecycle?.profiles?.[options.profile];
  if (!authored) throw new Error(`Blueprint does not declare '${options.profile}' agent lifecycle material`);
  const subject = options.profile === "use" ? "runtime" : options.profile === "customize" ? "customization" : "authoring";
  const definitions: Record<AgentLifecycleProfileOperation, AgentOperationManifest> = {
    discover: operation(`Discover Blueprint ${subject} targets available in the current host scope.`, options.schemas.discover),
    describe: operation(`Describe this Blueprint's authored ${subject} contract.`, options.schemas.target),
    inspect: operation(`Inspect current facts for a Blueprint ${subject} target.`, options.schemas.target),
    validate: operation(`Validate a proposed Blueprint ${subject} intent without applying it.`, options.schemas.intent),
    simulate: operation(`Simulate a Blueprint ${subject} intent without authoritative mutation.`, options.schemas.intent),
    preflight: operation(`Check a Blueprint ${subject} intent against current host policy and dependencies.`, options.schemas.intent),
    read_in_progress_proposal: operation(`Read the request-scoped in-progress Blueprint ${subject} proposal.`, options.schemas.discover),
    set_in_progress_proposal: operation(`Replace the complete request-scoped Blueprint ${subject} proposal.`, options.schemas.intent),
  };
  const operations = Object.fromEntries(
    resolveLifecycleProfileOperations(authored).map((operationName) => [operationName, definitions[operationName]]),
  );
  return {
    id: authored.id,
    version: authored.version,
    description: authored.description,
    targetKinds: authored.targetKinds,
    intentKinds: authored.intentKinds,
    proposalSchema: options.schemas.proposal,
    operations,
  };
}

export function useBlueprint<TDiscover = unknown, TTarget = unknown, TIntent = unknown, TProposal = unknown>(
  options: BlueprintUseOptions<TDiscover, TTarget, TIntent, TProposal>,
): readonly AgentTool[] {
  const ops = createBlueprintUseLifecycle(options);
  return defineBlueprintLifecycleProfile(options.blueprint, "use", "use_blueprint", ops).tools;
}

export function customizeBlueprint<TDiscover = unknown, TTarget = unknown, TIntent = unknown, TProposal = unknown>(
  options: BlueprintUseOptions<TDiscover, TTarget, TIntent, TProposal>,
): readonly AgentTool[] {
  const ops = createBlueprintLifecycle({ ...options, profile: "customize" });
  return defineBlueprintLifecycleProfile(options.blueprint, "customize", "customize_blueprint", ops).tools;
}

export function authorBlueprint<TDiscover = unknown, TTarget = unknown, TIntent = unknown, TProposal = unknown>(
  options: BlueprintUseOptions<TDiscover, TTarget, TIntent, TProposal>,
): readonly AgentTool[] {
  const ops = createBlueprintLifecycle({ ...options, profile: "author" });
  return defineBlueprintLifecycleProfile(options.blueprint, "author", "author_blueprint", ops).tools;
}

/** Mirrors `@gik/blueprint`'s own runtime derivation (namespaces = the declared runtime state's own
 * keys; actions = every verb a Cell's `behavior.on` handlers invoke) without importing that package --
 * this package is deliberately decoupled from `@gik/blueprint`'s types, so a Blueprint is described
 * from whatever shape it structurally carries. */
function deriveNamespaces(state: Readonly<Record<string, unknown>> | undefined): string[] {
  return Object.keys(state ?? {});
}

function deriveActions(cells: BlueprintUseSource["payload"]["cells"]): string[] {
  const actions = new Set<string>();
  for (const cell of Object.values(cells ?? {})) {
    for (const list of Object.values(cell.behavior?.on ?? {})) {
      for (const action of list ?? []) {
        if (action?.do) actions.add(action.do);
      }
    }
  }
  return [...actions];
}

function deriveUsedCapabilities(cells: BlueprintUseSource["payload"]["cells"]): string[] {
  const capabilities = new Set<string>();
  for (const cell of Object.values(cells ?? {})) {
    for (const view of Object.values(cell.potentialViews ?? {})) {
      if (view?.capability) capabilities.add(view.capability);
    }
  }
  return [...capabilities];
}

function resolveAllowedCapabilities(payload: BlueprintUseSource["payload"]): string[] {
  const tiers = new Map((payload.projectionTiers ?? []).map((tier) => [tier.id, tier.capabilities ?? []]));
  const capabilities = new Set<string>();
  for (const entry of payload.presentation?.allowedCapabilities ?? []) {
    if (typeof entry === "string") capabilities.add(entry);
    else for (const capability of tiers.get(entry.tier) ?? []) capabilities.add(capability);
  }
  return [...capabilities];
}

export function describeBlueprint(
  blueprint: BlueprintUseSource,
  profile: BlueprintLifecycleProfileKind = "use",
): Record<string, unknown> {
  const { payload } = blueprint;
  const authored = payload.agentLifecycle?.profiles?.[profile];
  return {
    identity: { id: payload.id, kind: payload.kind, version: payload.version },
    structure: {
      mode: payload.structureMode ?? "fixed",
      policy: payload.structurePolicy ?? null,
    },
    lifecycle: authored
      ? {
          profile,
          id: authored.id,
          version: authored.version,
          description: authored.description,
          goals: authored.goals ?? [],
          constraints: authored.constraints ?? [],
          targetKinds: authored.targetKinds,
          intentKinds: authored.intentKinds,
        }
      : null,
    serviceTiers: (payload.serviceTiers ?? []).map(({ id, kind, description }) => ({ id, kind, description })),
    projectionTiers: (payload.projectionTiers ?? []).map(({ id, kind, description, capabilities }) => ({
      id,
      kind,
      description,
      capabilities: capabilities ?? [],
    })),
    serviceRecipes: (payload.serviceRecipes ?? []).map(({ id, from, to }) => ({ id, from, to })),
    projectionRecipes: (payload.projectionRecipes ?? []).map(({ id, from, to }) => ({ id, from, to })),
    cells: Object.entries(payload.cells ?? {}).map(([id, cell]) => ({
      id,
      hasBehavior: cell.behavior !== undefined,
      inputCount: cell.inputs?.length ?? 0,
      outputCount: cell.outputs?.length ?? 0,
      sourceCount: cell.sources?.length ?? 0,
    })),
    services: Object.keys(payload.services ?? {}),
    runtime: {
      actions: deriveActions(payload.cells),
      capabilities: payload.presentation
        ? resolveAllowedCapabilities(payload)
        : deriveUsedCapabilities(payload.cells),
      namespaces: deriveNamespaces(payload.runtime?.state),
    },
  };
}