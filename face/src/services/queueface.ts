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
}

export interface ServiceRequest extends ServiceRequestInput {
  id: string;
  providerId: string;
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

export interface ServiceAgentTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly lifecycle: "agent" | "host" | "control";
  readonly handler: (args: unknown) => unknown | Promise<unknown>;
}

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
  | "dead-lettered";

export interface ServiceRequestRecord {
  request: ServiceRequest;
  mode: ServiceExecutionMode;
  status: ServiceRequestStatus;
  attempts: number;
  updatedAt: string;
  result?: ServiceExecutionResult;
  error?: string;
  errorDetail?: Record<string, Json>;
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

  submit(effect: OrchestratorEffect): Promise<ServiceRequestRecord> {
    return this.host.enqueue(effect);
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

