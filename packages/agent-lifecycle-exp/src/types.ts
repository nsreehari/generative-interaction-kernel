export type MaybePromise<T> = T | Promise<T>;
export type JsonSchema = Readonly<Record<string, unknown>>;

export const AGENT_LIFECYCLE_OPERATIONS = [
  "manifest",
  "discover",
  "describe",
  "inspect",
  "validate",
  "simulate",
  "preflight",
  "read_in_progress_proposal",
  "set_in_progress_proposal",
] as const;

export type AgentLifecycleOperation = typeof AGENT_LIFECYCLE_OPERATIONS[number];
export type AgentLifecycleProfileOperation = Exclude<AgentLifecycleOperation, "manifest">;
export type AgentLifecycleOperationPreset = "standard" | "static-authoring";

export const STANDARD_OPERATIONS = AGENT_LIFECYCLE_OPERATIONS.filter(
  (operation): operation is AgentLifecycleProfileOperation => operation !== "manifest",
);

export const STATIC_AUTHORING_OPERATIONS = [
  "describe",
  "validate",
  "simulate",
  "read_in_progress_proposal",
  "set_in_progress_proposal",
] as const satisfies readonly AgentLifecycleProfileOperation[];

export const AGENT_HOST_LIFECYCLE_OPERATIONS = [
  "receive",
  "authorize",
  "admit",
  "apply",
  "reject",
  "status",
] as const;

export type AgentHostLifecycleOperation = typeof AGENT_HOST_LIFECYCLE_OPERATIONS[number];

export interface AgentOperationManifest {
  readonly description: string;
  readonly inputSchema: JsonSchema;
}

export interface AgentCapabilityManifest {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly targetKinds: readonly string[];
  readonly intentKinds: readonly string[];
  readonly proposalSchema: JsonSchema;
  readonly operations: Readonly<Partial<Record<AgentLifecycleProfileOperation, AgentOperationManifest>>>;
}

export interface AgentTargetRef {
  readonly kind: string;
  readonly id: string;
  readonly version?: string;
  readonly instanceId?: string;
  readonly expectedRevision?: string | number;
}

export interface AgentProposal<TAction = unknown> {
  readonly id: string;
  readonly capability: string;
  readonly target: AgentTargetRef;
  readonly actions: readonly TAction[];
  readonly createdAt: string;
  readonly rationale?: string;
}

export interface AgentProposalDraft<TAction = unknown> {
  readonly actions: readonly TAction[];
  readonly rationale?: string | null;
}

export interface AgentLifecycleOps<
  TDiscover = unknown,
  TTarget = unknown,
  TIntent = unknown,
  TProposal = unknown,
> {
  manifest(): AgentCapabilityManifest;
  discover?(input: TDiscover): MaybePromise<unknown>;
  describe?(target: TTarget): MaybePromise<unknown>;
  inspect?(target: TTarget): MaybePromise<unknown>;
  validate?(intent: TIntent): MaybePromise<unknown>;
  simulate?(intent: TIntent): MaybePromise<unknown>;
  preflight?(intent: TIntent): MaybePromise<unknown>;
  read_in_progress_proposal?(input: unknown, context?: AgentToolExecutionContext): MaybePromise<TProposal | undefined>;
  set_in_progress_proposal?(intent: TIntent, context?: AgentToolExecutionContext): MaybePromise<TProposal>;
}

export interface AgentToolExecutionContext {
  readonly requestId: string;
}

export interface AgentHostLifecycleManifest {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly operations: Readonly<Record<AgentHostLifecycleOperation, AgentOperationManifest>>;
}

export interface AgentHostLifecycleOps<TProposal = unknown, TReceipt = unknown> {
  manifest(): AgentHostLifecycleManifest;
  receive(proposal: TProposal): MaybePromise<TReceipt>;
  authorize(receipt: TReceipt): MaybePromise<unknown>;
  admit(receipt: TReceipt): MaybePromise<unknown>;
  apply(receipt: TReceipt): MaybePromise<unknown>;
  reject(receipt: TReceipt): MaybePromise<unknown>;
  status(receipt: TReceipt): MaybePromise<unknown>;
}

export interface AgentTool<TResult = unknown> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly lifecycle: "agent" | "host" | "control";
  readonly handler: (args: unknown, context?: AgentToolExecutionContext) => MaybePromise<TResult>;
}

export interface AgentLifecycleProfile {
  readonly id: string;
  readonly prefix: string;
  readonly manifest: AgentCapabilityManifest;
  readonly tools: readonly AgentTool[];
}

export interface AgentHostLifecycleProfile {
  readonly id: string;
  readonly prefix: string;
  readonly manifest: AgentHostLifecycleManifest;
  readonly tools: readonly AgentTool[];
}

export type BlueprintLifecycleProfileKind = "use" | "customize" | "author";

export interface AuthoredLifecycleProfileMaterialBase {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly targetKinds: readonly string[];
  readonly intentKinds: readonly string[];
  readonly goals?: readonly string[];
  readonly constraints?: readonly string[];
}

export type AuthoredLifecycleProfileMaterial = AuthoredLifecycleProfileMaterialBase & (
  | { readonly operationPreset: AgentLifecycleOperationPreset; readonly operations?: never }
  | { readonly operationPreset?: never; readonly operations: readonly AgentLifecycleProfileOperation[] }
);

export interface BlueprintLifecycleMaterialSource {
  readonly payload: {
    readonly agentLifecycle?: {
      readonly profiles?: Partial<Record<BlueprintLifecycleProfileKind, AuthoredLifecycleProfileMaterial>>;
    };
  };
}