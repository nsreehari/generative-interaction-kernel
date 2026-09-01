import type {
  GuardrailRule,
  Json,
  OrchestratorEffect,
  OrchestratorResult,
  ServiceSubject,
} from "../../../kernel/src/index";
import type { ServiceHost } from "./service-host";

export type ContractAssurance =
  | "declared-and-locally-validated"
  | "provider-discovered"
  | "provider-validated-only"
  | "opaque";

export interface ServiceCapabilityDescriptor {
  id: string;
  operation: string;
  version: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  assurance: ContractAssurance;
  supports?: {
    validate?: boolean;
    simulate?: boolean;
    cancel?: boolean;
  };
}

export interface ServiceProviderDescriptor {
  id: string;
  version: string;
  title?: string;
  description?: string;
}

export interface ServiceCatalogSnapshot {
  provider: ServiceProviderDescriptor;
  revision: string;
  discoveredAt: string;
  capabilities: ServiceCapabilityDescriptor[];
  warnings?: string[];
}

/** Bounded, JSON-safe descriptor of the concrete external target an operation acts on --
 * deliberately separate from the opaque operation `input`, so the host can compare an
 * authorization's `approvedTarget` against the invocation's actual target without needing to
 * understand domain-specific payload shapes. */
export interface InvocationAuthorizationTarget {
  readonly ref: string;
  readonly revision?: string;
}

export interface ServiceRequestInput {
  service: string;
  operation: string;
  input?: Json;
  eventPayload?: Record<string, Json>;
  actorId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  deadline?: string;
  blueprintId?: string;
  blueprintRevision?: string;
  serviceRef?: string;
  subject?: ServiceSubject;
  /** The concrete external target this request acts on, if any. Compared against an
   * `InvocationAuthorizationSnapshot.approvedTarget` by the host, independent of any custom
   * `ServiceInvocationAuthorizer`. */
  target?: InvocationAuthorizationTarget;
}

export interface ServiceRequest extends ServiceRequestInput {
  id: string;
  providerId: string;
  capabilityId: string;
  createdAt: string;
}

interface PreMaterializationServiceRequest extends ServiceRequestInput {
  id: string;
  capabilityId: string;
  createdAt: string;
}

export interface ServiceValidationReport {
  ok: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface ServiceProbeResult {
  ok: boolean;
  detail?: Record<string, Json>;
}

export interface ServiceSimulationResult {
  output?: Json;
  detail?: Record<string, Json>;
}

export interface ServiceExecutionResult {
  output?: Json;
  detail?: Record<string, Json>;
  /** Optional GIK settlement supplied by a GIK-aware binding or adapter. */
  orchestratorResult?: OrchestratorResult;
}

export type ServiceRequestContext = Pick<
  ServiceRequestInput,
  "actorId" | "correlationId" | "idempotencyKey" | "deadline" | "target"
>;

/** Host-created context passed out-of-band to projected tool handlers. Provider-supplied
 * arguments cannot replace these request identity and provenance fields. */
export interface ServiceAgentToolExecutionContext extends ServiceRequestContext {
  readonly requestId: string;
  readonly service: string;
  readonly operation: string;
  readonly providerId: string;
  readonly capabilityId: string;
  readonly blueprintId?: string;
  readonly blueprintRevision?: string;
  readonly serviceRef?: string;
  readonly signal?: AbortSignal;
}

export interface ServiceAgentTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly lifecycle: "agent" | "host" | "control";
  readonly handler: (
    args: unknown,
    context?: ServiceAgentToolExecutionContext
  ) => unknown | Promise<unknown>;
}

export type ServiceAgentToolProjection = (
  context: ServiceAgentToolExecutionContext
) => readonly ServiceAgentTool[];

/** Authorization applies to one concrete service request or tool call. Tool catalog
 * visibility is intentionally not an authorization decision. */
export type ServiceInvocationAuthorizationDecision =
  | {
      readonly outcome: "authorized";
      readonly validUntil?: string;
      readonly detail?: Record<string, Json>;
    }
  | {
      readonly outcome: "rejected";
      readonly reason: string;
      readonly detail?: Record<string, Json>;
    }
  | {
      readonly outcome: "confirmation-required";
      readonly reason: string;
      /** Bounded intent a Cell can turn into an actual `request` action. Recipients/audiences
       * remain host-owned and are resolved later from `requestType` -- never supplied here. */
      readonly requestIntent?: ServiceConfirmationRequestIntent;
      readonly detail?: Record<string, Json>;
    };

/** A bounded confirmation-request intent an authorization decision may carry so a Cell can emit a
 * typed `request` action instead of parsing an arbitrary rejection string. Only these fields are
 * permitted: the agent/participant cannot supply recipients, channels, or role names -- audience
 * routing for `requestType` remains entirely host-owned. */
export interface ServiceConfirmationRequestIntent {
  readonly requestType: string;
  readonly context?: Record<string, Json>;
  readonly subject?: ServiceSubject;
}

export type AuthorityScope = "none" | "read" | "propose" | "apply";

/** One decomposed boundary of a participant's authority -- for example its ability to read
 * observations versus its ability to apply domain effects. Boundaries are evaluated
 * independently so unrelated grants are never bundled together. */
export interface AuthorityBoundary {
  readonly scope: AuthorityScope;
  readonly detail?: Record<string, Json>;
}

/** Host-authored, host-owned decomposition of what one participant/actor may do. The participant
 * cannot select, modify, or widen its own profile; the host assigns it and the profile is always
 * inspectable by name (`id`) and revision. */
export interface InvocationAuthorityProfile {
  readonly id: string;
  readonly observation: AuthorityBoundary;
  readonly planState: AuthorityBoundary;
  readonly memory: AuthorityBoundary;
  readonly producerArtifact: AuthorityBoundary;
  readonly domainEffects: AuthorityBoundary;
}

/** Cheap, immutable, request-scoped authorization context computed once per service request so
 * that repeated agent-tool and retry authorization checks stay local, bounded, and
 * approximately O(1). It is deliberately not re-fetched mid-request -- remote policy/grant
 * refresh happens out of band -- but every authorization checkpoint (pre-materialization,
 * execution, agent-tool, guardrail retry) still fails closed on a live kill-switch read and on
 * snapshot expiry, so approved-but-not-yet-applied work is always revalidated. */
export interface InvocationAuthorizationSnapshot {
  readonly issuedAt: string;
  readonly expiresAt?: string;
  readonly subject?: ServiceSubject;
  readonly actorId?: string;
  readonly authorityProfile: InvocationAuthorityProfile;
  readonly authorityProfileRevision: string;
  readonly policyRevision: string;
  readonly grantRevision?: string;
  /** Kill-switch state observed at snapshot creation. The host additionally re-reads a live
   * kill-switch on every authorization checkpoint; this field is informational/audit only. */
  readonly killSwitchEngaged: boolean;
  /** When true, the host fails closed on any invocation whose request has no `idempotencyKey`,
   * regardless of what a custom `ServiceInvocationAuthorizer` would otherwise decide. */
  readonly requiresIdempotencyKey?: boolean;
  /** The target and revision this authorization was actually approved against. The host rejects
   * any invocation whose request `target` differs (by `ref` or by a defined `revision`), so an
   * approval cannot be replayed against a since-changed target. */
  readonly approvedTarget?: InvocationAuthorizationTarget;
  readonly approvalRef?: string;
  readonly budget?: { readonly limit?: number; readonly remaining?: number };
  readonly detail?: Record<string, Json>;
}

export type ServiceInvocation =
  | {
      readonly kind: "service-request";
      readonly phase: "pre-materialization";
      readonly request: Readonly<PreMaterializationServiceRequest>;
      readonly authorizationSnapshot?: InvocationAuthorizationSnapshot;
    }
  | {
      readonly kind: "service-request";
      readonly phase: "execution";
      readonly request: Readonly<ServiceRequest>;
      readonly authorizationSnapshot?: InvocationAuthorizationSnapshot;
    }
  | {
      readonly kind: "agent-tool";
      readonly request: Readonly<ServiceRequest>;
      readonly tool: string;
      readonly args: unknown;
      readonly authorizationSnapshot?: InvocationAuthorizationSnapshot;
    };

export type ServiceInvocationAuthorizer = (
  invocation: ServiceInvocation
) => ServiceInvocationAuthorizationDecision | Promise<ServiceInvocationAuthorizationDecision>;

export interface ServiceAdapterContext {
  signal?: AbortSignal;
  effect?: OrchestratorEffect;
  /** Blueprint-declared response validators. Adapters may use an AJV schema to request
   * provider-native structured output; the host still validates the returned data. */
  responseValidators?: readonly GuardrailRule[];
  /** Host-owned, request-scoped agent tools. Provider adapters may relay calls to these
   * handlers but cannot add authority or execute undeclared tool names. */
  agentTools?: readonly ServiceAgentTool[];
}

export interface ServiceAdapter {
  readonly provider: ServiceProviderDescriptor;
  discover(): Promise<ServiceCatalogSnapshot>;
  validate?(
    request: ServiceRequestInput,
    context: ServiceAdapterContext
  ): ServiceValidationReport | Promise<ServiceValidationReport>;
  simulate?(
    request: ServiceRequestInput,
    context: ServiceAdapterContext
  ): ServiceSimulationResult | Promise<ServiceSimulationResult>;
  probe?(context: ServiceAdapterContext): ServiceProbeResult | Promise<ServiceProbeResult>;
  execute(
    request: ServiceRequest,
    context: ServiceAdapterContext
  ): ServiceExecutionResult | Promise<ServiceExecutionResult>;
  cancel?(request: ServiceRequest, context: ServiceAdapterContext): void | Promise<void>;
}

export type ServiceExecutionMode = "immediate" | "queued";

export type ServiceRequestStatus =
  | "accepted"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "dead-lettered"
  | "rejected"
  | "confirmation-required";

export interface ServiceRequestRecord {
  request: ServiceRequest;
  mode: ServiceExecutionMode;
  status: ServiceRequestStatus;
  attempts: number;
  updatedAt: string;
  result?: ServiceExecutionResult;
  error?: string;
  errorDetail?: Record<string, Json>;
  authorization?: ServiceInvocationAuthorizationDecision;
  /** Immutable, request-scoped authorization context computed once so retry/tool-call
   * authorization checks stay local and cheap. Absent when the host is not configured with an
   * `authorizationSnapshot` builder. */
  authorizationSnapshot?: InvocationAuthorizationSnapshot;
  /** Re-invocation count driven by guardrail violation policy, distinct from transport-level `attempts`. */
  guardrailAttempts?: number;
  /** The most recent guardrail evaluation's `"error"`-level issues, if any were ever raised. */
  guardrailViolations?: readonly { detail: string; code?: string; node?: string }[];
}

export interface ServiceRequestStore {
  put(record: ServiceRequestRecord): void | Promise<void>;
  get(id: string): ServiceRequestRecord | undefined | Promise<ServiceRequestRecord | undefined>;
  list(): ServiceRequestRecord[] | Promise<ServiceRequestRecord[]>;
}

export class InMemoryServiceRequestStore implements ServiceRequestStore {
  private readonly records = new Map<string, ServiceRequestRecord>();

  put(record: ServiceRequestRecord): void {
    this.records.set(record.request.id, structuredClone(record));
  }

  get(id: string): ServiceRequestRecord | undefined {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }

  list(): ServiceRequestRecord[] {
    return [...this.records.values()].map((record) => structuredClone(record));
  }
}
/** Queue-oriented Face projection. Scheduling, storage, leasing, execution, retry, and
 * cancellation are implemented by the host behind `ServiceHost`. */
export class QueueFace {
  constructor(private readonly host: ServiceHost) {}

  submit(effect: OrchestratorEffect, context?: ServiceRequestContext): Promise<ServiceRequestRecord> {
    return this.host.enqueue(effect, context);
  }

  async getRequest(id: string): Promise<ServiceRequestRecord | undefined> {
    return this.host.getRequest(id);
  }

  async listRequests(): Promise<ServiceRequestRecord[]> {
    return this.host.listRequests();
  }

  async cancel(id: string): Promise<ServiceRequestRecord> {
    return this.host.cancel(id);
  }
}
