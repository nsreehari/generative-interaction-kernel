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
  "propose",
] as const;

export type AgentLifecycleOperation = typeof AGENT_LIFECYCLE_OPERATIONS[number];

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
  readonly operations: Readonly<Record<Exclude<AgentLifecycleOperation, "manifest">, AgentOperationManifest>>;
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

export interface AgentLifecycleOps<
  TDiscover = unknown,
  TTarget = unknown,
  TIntent = unknown,
  TProposal = unknown,
> {
  manifest(): AgentCapabilityManifest;
  discover(input: TDiscover): MaybePromise<unknown>;
  describe(target: TTarget): MaybePromise<unknown>;
  inspect(target: TTarget): MaybePromise<unknown>;
  validate(intent: TIntent): MaybePromise<unknown>;
  simulate(intent: TIntent): MaybePromise<unknown>;
  preflight(intent: TIntent): MaybePromise<unknown>;
  propose(intent: TIntent): MaybePromise<TProposal>;
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
  readonly handler: (args: unknown) => MaybePromise<TResult>;
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

export interface AuthoredLifecycleProfileMaterial {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly targetKinds: readonly string[];
  readonly intentKinds: readonly string[];
  readonly goals?: readonly string[];
  readonly constraints?: readonly string[];
}

export interface BlueprintLifecycleMaterialSource {
  readonly payload: {
    readonly agentLifecycle?: {
      readonly profiles?: Partial<Record<BlueprintLifecycleProfileKind, AuthoredLifecycleProfileMaterial>>;
    };
  };
}