import { runDeclarativeValidators } from "@gik/evaluators";
import type {
  Json,
  Orchestrator,
  OrchestratorEffect,
  OrchestratorResult,
  ServiceOutputPolicy,
  ServiceRequirement,
  ServiceSubject,
} from "../../../kernel/src/index";

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

export interface ServiceAdapterContext {
  signal?: AbortSignal;
  effect?: OrchestratorEffect;
  /** Resolved guardrail/output policy for this binding (see `ServiceBinding.outputPolicy`).
   * Adapters MAY use this to request tool-level correctness (e.g. a provider's own
   * structured-output / JSON-schema generation mode) instead of relying solely on
   * post-hoc guardrail validation. Guardrail enforcement still runs regardless. */
  outputPolicy?: ServiceOutputPolicy;
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

export interface ServiceBinding {
  service: string;
  version: string;
  operation: string;
  providerId: string;
  capabilityId: string;
  /** Existing GIK `invoke` tool name routed to this logical operation. */
  invoke: string;
  mode?: ServiceExecutionMode;
  blueprintId?: string;
  blueprintRevision?: string;
  serviceRef?: string;
  subject?: ServiceSubject;
  /** Resolved guardrail/output policy (kind default, Blueprint declaration, call-site override, in
   * that priority) enforced by `QueueFace` after each successful adapter execution. */
  outputPolicy?: ServiceOutputPolicy;
  mapRequest?: (effect: OrchestratorEffect) => ServiceRequestInput;
  mapResult?: (result: ServiceExecutionResult, effect: OrchestratorEffect) => OrchestratorResult;
}

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
export interface QueueFaceOptions {
  store?: ServiceRequestStore;
  now?: () => Date;
  idFactory?: () => string;
  maxAttempts?: number;
  /** Hard ceiling on guardrail-driven retry/correction re-invocations, independent of and always
   * enforced regardless of any larger `maxAttempts` a policy's `onViolation` action declares. */
  maxGuardrailAttempts?: number;
}

export interface ServiceSatisfactionReport {
  ok: boolean;
  missing: string[];
  incompatible: string[];
}

interface PendingExecution {
  id: string;
  effect?: OrchestratorEffect;
}

const bindingKey = (service: string, operation: string): string => `${service}\u0000${operation}`;

export class QueueFace {
  private readonly adapters = new Map<string, ServiceAdapter>();
  private readonly bindings = new Map<string, ServiceBinding>();
  private readonly invocationBindings = new Map<string, ServiceBinding>();
  private readonly pending: PendingExecution[] = [];
  private readonly controllers = new Map<string, AbortController>();
  private readonly store: ServiceRequestStore;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly maxAttempts: number;
  private readonly maxGuardrailAttempts: number;
  private nextId = 0;

  constructor(options: QueueFaceOptions = {}) {
    this.store = options.store ?? new InMemoryServiceRequestStore();
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? (() => `service-${this.now().getTime().toString(36)}-${++this.nextId}`);
    this.maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
    this.maxGuardrailAttempts = Math.max(1, Math.floor(options.maxGuardrailAttempts ?? 3));
  }

  registerAdapter(adapter: ServiceAdapter): void {
    const id = adapter.provider.id.trim();
    if (!id) throw new Error("QueueFace: provider id is required");
    if (this.adapters.has(id)) throw new Error(`QueueFace: provider '${id}' is already registered`);
    this.adapters.set(id, adapter);
  }

  hasProvider(providerId: string): boolean {
    return this.adapters.has(providerId);
  }

  bind(binding: ServiceBinding): void {
    if (!this.adapters.has(binding.providerId)) {
      throw new Error(`QueueFace: provider '${binding.providerId}' is not registered`);
    }
    const key = bindingKey(binding.service, binding.operation);
    if (this.bindings.has(key)) {
      throw new Error(`QueueFace: service operation '${binding.service}.${binding.operation}' is already bound`);
    }
    if (this.invocationBindings.has(binding.invoke)) {
      throw new Error(`QueueFace: invoke '${binding.invoke}' is already bound`);
    }
    const normalized = { ...binding, mode: binding.mode ?? "immediate" };
    this.bindings.set(key, normalized);
    this.invocationBindings.set(binding.invoke, normalized);
  }

  satisfies(requirements?: Record<string, ServiceRequirement>): ServiceSatisfactionReport {
    const missing: string[] = [];
    const incompatible: string[] = [];
    for (const [service, requirement] of Object.entries(requirements ?? {})) {
      for (const operation of requirement.operations) {
        const binding = this.bindings.get(bindingKey(service, operation));
        if (!binding) {
          missing.push(`${service}.${operation}`);
        } else if (binding.version !== requirement.version) {
          incompatible.push(`${service}.${operation}: requires ${requirement.version}, bound ${binding.version}`);
        }
      }
    }
    return { ok: missing.length === 0 && incompatible.length === 0, missing, incompatible };
  }

  assertSatisfies(requirements?: Record<string, ServiceRequirement>): void {
    const report = this.satisfies(requirements);
    if (!report.ok) {
      throw new Error(
        `QueueFace: unsatisfied service requirements${report.missing.length ? `; missing: ${report.missing.join(", ")}` : ""}${report.incompatible.length ? `; incompatible: ${report.incompatible.join(", ")}` : ""}`
      );
    }
  }

  async describeServices(): Promise<{
    providers: ServiceCatalogSnapshot[];
    bindings: ServiceBinding[];
  }> {
    const providers = await Promise.all([...this.adapters.values()].map((adapter) => adapter.discover()));
    return { providers, bindings: [...this.bindings.values()].map((binding) => ({ ...binding })) };
  }

  async validate(request: ServiceRequestInput): Promise<ServiceValidationReport> {
    const { adapter } = this.resolve(request.service, request.operation);
    if (!adapter.validate) {
      return { ok: true, warnings: ["Provider does not expose additional validation"] };
    }
    return adapter.validate(request, {});
  }

  async simulate(request: ServiceRequestInput): Promise<ServiceSimulationResult> {
    const { adapter } = this.resolve(request.service, request.operation);
    if (!adapter.simulate) {
      throw new Error(`QueueFace: '${request.service}.${request.operation}' does not support simulation`);
    }
    return adapter.simulate(request, {});
  }

  async probe(providerId: string): Promise<ServiceProbeResult> {
    const adapter = this.adapters.get(providerId);
    if (!adapter) throw new Error(`QueueFace: unknown provider '${providerId}'`);
    if (!adapter.probe) return { ok: true, detail: { note: "Provider does not expose a probe" } };
    return adapter.probe({});
  }

  async submit(input: ServiceRequestInput, effect?: OrchestratorEffect): Promise<ServiceRequestRecord> {
    const { binding } = this.resolve(input.service, input.operation);
    if (input.idempotencyKey) {
      const existing = (await this.store.list()).find(
        (record) =>
          record.request.service === input.service &&
          record.request.operation === input.operation &&
          record.request.idempotencyKey === input.idempotencyKey &&
          record.status !== "failed" &&
          record.status !== "cancelled" &&
          record.status !== "dead-lettered"
      );
      if (existing) return existing;
    }

    const timestamp = this.now().toISOString();
    const request: ServiceRequest = {
      ...input,
      blueprintId: input.blueprintId ?? binding.blueprintId,
      blueprintRevision: input.blueprintRevision ?? binding.blueprintRevision,
      serviceRef: input.serviceRef ?? binding.serviceRef,
      subject: input.subject ?? binding.subject,
      id: this.idFactory(),
      providerId: binding.providerId,
      capabilityId: binding.capabilityId,
      createdAt: timestamp,
    };
    const record: ServiceRequestRecord = {
      request,
      mode: binding.mode ?? "immediate",
      status: "accepted",
      attempts: 0,
      updatedAt: timestamp,
    };
    await this.store.put(record);

    if (record.mode === "queued") {
      this.pending.push({ id: request.id, effect });
      return record;
    }
    return this.execute(record, effect);
  }

  async runNext(): Promise<ServiceRequestRecord | undefined> {
    const next = this.pending.shift();
    if (!next) return undefined;
    const record = await this.store.get(next.id);
    if (!record || record.status !== "accepted") return record;
    return this.execute(record, next.effect);
  }

  async getRequest(id: string): Promise<ServiceRequestRecord | undefined> {
    return this.store.get(id);
  }

  async listRequests(): Promise<ServiceRequestRecord[]> {
    return this.store.list();
  }

  async cancel(id: string): Promise<ServiceRequestRecord> {
    const record = await this.store.get(id);
    if (!record) throw new Error(`QueueFace: unknown request '${id}'`);
    if (["completed", "failed", "cancelled", "dead-lettered"].includes(record.status)) return record;
    const adapter = this.adapters.get(record.request.providerId)!;
    this.controllers.get(id)?.abort();
    await adapter.cancel?.(record.request, {});
    const cancelled = { ...record, status: "cancelled" as const, updatedAt: this.now().toISOString() };
    await this.store.put(cancelled);
    return cancelled;
  }

  createOrchestrator(fallback?: Orchestrator): Orchestrator {
    const route = async (method: "invoke" | "confirm" | "route", effect: OrchestratorEffect) => {
      const binding = effect.tool ? this.invocationBindings.get(effect.tool) : undefined;
      if (!binding) return fallback?.[method]?.(effect);
      const args = { ...(effect.args ?? {}) };
      delete args.tool;
      const mapped = binding.mapRequest?.(effect);
      const record = await this.submit(
        mapped ?? {
          service: binding.service,
          operation: binding.operation,
          input: args,
          eventPayload: effect.payload,
          actorId: effect.actorId,
        },
        effect
      );
      if (record.status === "completed" && record.result) {
        return binding.mapResult?.(record.result, effect)
          ?? record.result.orchestratorResult
          ?? { outcome: "completed", detail: { requestId: record.request.id } };
      }
      return { outcome: record.status, detail: { requestId: record.request.id } };
    };
    return {
      invoke: (effect) => route("invoke", effect),
      confirm: (effect) => route("confirm", effect),
      route: (effect) => route("route", effect),
      compensate: fallback?.compensate?.bind(fallback),
    };
  }

  private resolve(service: string, operation: string): { binding: ServiceBinding; adapter: ServiceAdapter } {
    const binding = this.bindings.get(bindingKey(service, operation));
    if (!binding) throw new Error(`QueueFace: unbound service operation '${service}.${operation}'`);
    return { binding, adapter: this.adapters.get(binding.providerId)! };
  }

  private async execute(record: ServiceRequestRecord, effect?: OrchestratorEffect): Promise<ServiceRequestRecord> {
    const { adapter, binding } = this.resolve(record.request.service, record.request.operation);
    const controller = new AbortController();
    this.controllers.set(record.request.id, controller);
    const running: ServiceRequestRecord = {
      ...record,
      status: "running",
      attempts: record.attempts + 1,
      updatedAt: this.now().toISOString(),
    };
    await this.store.put(running);
    try {
      const result = await adapter.execute(running.request, { signal: controller.signal, effect, outputPolicy: binding.outputPolicy });
      const settled = await this.settleWithGuardrails(running, result, binding.outputPolicy, controller, effect);
      await this.store.put(settled);
      return settled;
    } catch (error) {
      const retry = running.mode === "queued" && running.attempts < this.maxAttempts;
      const failed: ServiceRequestRecord = {
        ...running,
        status: retry ? "accepted" : running.mode === "queued" ? "dead-lettered" : "failed",
        error: error instanceof Error ? error.message : String(error),
        updatedAt: this.now().toISOString(),
      };
      await this.store.put(failed);
      if (retry) this.pending.push({ id: running.request.id, effect });
      return failed;
    } finally {
      this.controllers.delete(record.request.id);
    }
  }

  /** Evaluates the resolved output policy's guardrails against a successful adapter result and
   * applies `onViolation` (fail / bounded retry / bounded correction-prompt / fallback) before the
   * request is allowed to settle as `"completed"`. A declaration with no guardrails behaves exactly
   * as before this policy layer existed. */
  private async settleWithGuardrails(
    running: ServiceRequestRecord,
    result: ServiceExecutionResult,
    policy: ServiceOutputPolicy | undefined,
    controller: AbortController,
    effect?: OrchestratorEffect
  ): Promise<ServiceRequestRecord> {
    if (!policy?.guardrails || policy.guardrails.length === 0) {
      return { ...running, status: "completed", result, updatedAt: this.now().toISOString() };
    }

    const report = runDeclarativeValidators(policy.guardrails, (result.output ?? null) as Json, {});
    if (report.ok) {
      const detail = report.warnings.length
        ? { ...(result.detail ?? {}), guardrailWarnings: report.warnings }
        : result.detail;
      return { ...running, status: "completed", result: { ...result, detail }, updatedAt: this.now().toISOString() };
    }

    const action = policy.onViolation ?? { action: "fail" };
    const guardrailAttempts = (running.guardrailAttempts ?? 0) + 1;
    const violated: ServiceRequestRecord = {
      ...running,
      guardrailAttempts,
      guardrailViolations: report.errors,
      updatedAt: this.now().toISOString(),
    };

    if (action.action === "retry" || action.action === "correction-prompt") {
      const ceiling = Math.min(action.maxAttempts ?? 2, this.maxGuardrailAttempts);
      if (guardrailAttempts < ceiling) {
        const { adapter } = this.resolve(running.request.service, running.request.operation);
        const nextRequest: ServiceRequest = action.action === "correction-prompt"
          ? {
              ...running.request,
              eventPayload: {
                ...(running.request.eventPayload ?? {}),
                guardrailCorrection: { issues: report.errors },
              },
            }
          : running.request;
        const retrying: ServiceRequestRecord = { ...violated, request: nextRequest };
        await this.store.put(retrying);
        const nextResult = await adapter.execute(nextRequest, { signal: controller.signal, effect, outputPolicy: policy });
        return this.settleWithGuardrails(retrying, nextResult, policy, controller, effect);
      }
    }

    const reason = action.action === "fallback"
      ? "fallback"
      : action.action === "fail"
        ? "fail"
        : `exhausted ${action.action}`;
    return {
      ...violated,
      status: "failed",
      error: `guardrail violation (${reason}): ${report.errors.map((issue) => issue.detail).join("; ")}`,
    };
  }
}

