import type { AgentProposal, AgentTargetRef, MaybePromise } from "gik-agent-lifecycle-exp";

export type BlueprintProposalStatus =
  | "received"
  | "authorized"
  | "admitted"
  | "applying"
  | "applied"
  | "rejected"
  | "failed";

export interface BlueprintProposalActor {
  readonly id: string;
  readonly claims?: Readonly<Record<string, unknown>>;
}

export interface BlueprintProposalAuditEvent {
  readonly status: BlueprintProposalStatus;
  readonly at: string;
  readonly detail?: string;
}

export interface BlueprintProposalReceipt<TProposal extends AgentProposal = AgentProposal> {
  readonly id: string;
  readonly proposal: TProposal;
  readonly actor: BlueprintProposalActor;
  readonly status: BlueprintProposalStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly audit: readonly BlueprintProposalAuditEvent[];
  readonly authorization?: BlueprintHostDecision;
  readonly admission?: BlueprintHostDecision;
  readonly applicationPolicy?: BlueprintApplicationPolicyDecision;
  readonly application?: unknown;
  readonly failure?: string;
}

export interface BlueprintApplicationPolicyDecision {
  readonly automatic: boolean;
  readonly reason?: string;
  readonly detail?: unknown;
}

export interface BlueprintHostDecision {
  readonly ok: boolean;
  readonly reason?: string;
  readonly detail?: unknown;
}

export interface BlueprintTargetSnapshot {
  readonly target: AgentTargetRef;
  readonly revision: string | number;
  readonly value?: unknown;
}

export interface BlueprintAuthority<TProposal extends AgentProposal = AgentProposal> {
  inspect(target: AgentTargetRef): MaybePromise<BlueprintTargetSnapshot>;
  validate(proposal: TProposal, snapshot: BlueprintTargetSnapshot): MaybePromise<BlueprintHostDecision>;
  /** Must be idempotent by receipt.id so recovery from an applying receipt cannot duplicate effects. */
  apply(receipt: BlueprintProposalReceipt<TProposal>, context?: unknown): MaybePromise<unknown>;
}

export interface BlueprintProposalStore<TProposal extends AgentProposal = AgentProposal> {
  create(receipt: BlueprintProposalReceipt<TProposal>): MaybePromise<BlueprintProposalReceipt<TProposal>>;
  get(id: string): MaybePromise<BlueprintProposalReceipt<TProposal> | undefined>;
  update(receipt: BlueprintProposalReceipt<TProposal>): MaybePromise<BlueprintProposalReceipt<TProposal>>;
  list(): MaybePromise<readonly BlueprintProposalReceipt<TProposal>[]>;
}