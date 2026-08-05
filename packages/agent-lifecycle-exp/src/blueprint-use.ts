import type {
  AgentCapabilityManifest,
  AgentLifecycleOps,
  AgentOperationManifest,
  AgentTool,
  BlueprintLifecycleMaterialSource,
  BlueprintLifecycleProfileKind,
  JsonSchema,
  MaybePromise,
} from "./types";
import { defineBlueprintLifecycleProfile } from "./tools";

export interface BlueprintUseSource extends BlueprintLifecycleMaterialSource {
  readonly payload: BlueprintLifecycleMaterialSource["payload"] & {
    readonly id: string;
    readonly kind: string;
    readonly version: string;
    readonly structureMode?: string;
    readonly structurePolicy?: unknown;
    readonly tiers?: readonly { readonly id?: string; readonly kind?: string; readonly description?: string }[];
    readonly cells?: Readonly<Record<string, {
      readonly id?: string;
      readonly kind?: string;
      readonly inputs?: readonly unknown[];
      readonly outputs?: readonly unknown[];
      readonly behavior?: unknown;
      readonly sources?: readonly unknown[];
    }>>;
    readonly services?: Readonly<Record<string, unknown>>;
    readonly runtime?: {
      readonly actions?: readonly string[];
      readonly capabilities?: Readonly<Record<string, unknown>>;
      readonly namespaces?: readonly string[];
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
  discover(input: TDiscover): MaybePromise<unknown>;
  inspect(target: TTarget): MaybePromise<unknown>;
  validate(intent: TIntent): MaybePromise<unknown>;
  simulate(intent: TIntent): MaybePromise<unknown>;
  preflight(intent: TIntent): MaybePromise<unknown>;
  propose(intent: TIntent): MaybePromise<TProposal>;
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

  return {
    manifest: () => manifest,
    discover: (input) => options.host.discover(input),
    describe: () => describeBlueprint(options.blueprint, options.profile),
    inspect: (target) => options.host.inspect(target),
    validate: (intent) => options.host.validate(intent),
    simulate: (intent) => options.host.simulate(intent),
    preflight: (intent) => options.host.preflight(intent),
    propose: (intent) => options.host.propose(intent),
  };
}

export function createBlueprintLifecycleManifest(
  options: BlueprintLifecycleManifestOptions,
): AgentCapabilityManifest {
  const authored = options.blueprint.payload.agentLifecycle?.profiles?.[options.profile];
  if (!authored) throw new Error(`Blueprint does not declare '${options.profile}' agent lifecycle material`);
  const subject = options.profile === "use" ? "runtime" : options.profile === "customize" ? "customization" : "authoring";
  return {
    id: authored.id,
    version: authored.version,
    description: authored.description,
    targetKinds: authored.targetKinds,
    intentKinds: authored.intentKinds,
    proposalSchema: options.schemas.proposal,
    operations: {
      discover: operation(`Discover Blueprint ${subject} targets available in the current host scope.`, options.schemas.discover),
      describe: operation(`Describe this Blueprint's authored ${subject} contract.`, options.schemas.target),
      inspect: operation(`Inspect current facts for a Blueprint ${subject} target.`, options.schemas.target),
      validate: operation(`Validate a proposed Blueprint ${subject} intent without applying it.`, options.schemas.intent),
      simulate: operation(`Simulate a Blueprint ${subject} intent without authoritative mutation.`, options.schemas.intent),
      preflight: operation(`Check a Blueprint ${subject} intent against current host policy and dependencies.`, options.schemas.intent),
      propose: operation(`Submit a Blueprint ${subject} intent for host admission and application.`, options.schemas.intent),
    },
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
    tiers: (payload.tiers ?? []).map(({ id, kind, description }) => ({ id, kind, description })),
    cells: Object.entries(payload.cells ?? {}).map(([id, cell]) => ({
      id,
      kind: cell.kind,
      hasBehavior: cell.behavior !== undefined,
      inputCount: cell.inputs?.length ?? 0,
      outputCount: cell.outputs?.length ?? 0,
      sourceCount: cell.sources?.length ?? 0,
    })),
    services: Object.keys(payload.services ?? {}),
    runtime: {
      actions: payload.runtime?.actions ?? [],
      capabilities: Object.keys(payload.runtime?.capabilities ?? {}),
      namespaces: payload.runtime?.namespaces ?? [],
    },
  };
}