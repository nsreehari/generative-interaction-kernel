import { runDeclarativeValidators } from "../../../packages/evaluators/src/index";
import type {
  ExpressionProvider,
  Json,
  OrchestratorEffect,
  OrchestratorResult,
  ServiceDeclaration,
  ServiceOperationDeclaration,
  StateModel,
} from "../../../kernel/src/index";
import type {
  ServiceAdapter,
  ServiceAgentTool,
  ServiceCatalogSnapshot,
  ServiceExecutionResult,
  ServiceProbeResult,
  ServiceRequest,
  ServiceRequestInput,
  ServiceRequestRecord,
  ServiceRequestStore,
  ServiceSimulationResult,
  ServiceValidationReport,
} from "./queueface";
import { InMemoryServiceRequestStore } from "./queueface";
import {
  UnsatisfiedServiceDependencyError,
  type ServiceKindDescription,
  type ServiceKindRegistry,
} from "./service-kinds";

/** Host-owned service capability projected through ControlFace and QueueFace.
 * Faces delegate to this contract; they do not materialize or execute service kinds themselves. */
export interface ServiceHost {
  describeKinds(): ServiceKindDescription[];
  describeServices(): Promise<ServiceCatalogSnapshot[]>;
  validateService(serviceId: string): Promise<ServiceValidationReport>;
  discoverService(serviceId: string): Promise<ServiceCatalogSnapshot>;
  probeService(serviceId: string): Promise<ServiceProbeResult>;
  preflight(effect: OrchestratorEffect): Promise<ServiceSimulationResult>;
  invoke(effect: OrchestratorEffect): Promise<OrchestratorResult | void>;
  enqueue(effect: OrchestratorEffect): Promise<ServiceRequestRecord>;
  getRequest(id: string): Promise<ServiceRequestRecord | undefined>;
  listRequests(): Promise<ServiceRequestRecord[]>;
  cancel(id: string): Promise<ServiceRequestRecord>;
}

export interface DefaultServiceHostOptions {
  blueprintId: string;
  blueprintRevision: string;
  declarations: Record<string, ServiceDeclaration>;
  registry: ServiceKindRegistry;
  state: StateModel;
  expression: ExpressionProvider;
  store?: ServiceRequestStore;
  now?: () => Date;
  idFactory?: () => string;
  maxAttempts?: number;
  maxGuardrailAttempts?: number;
  agentTools?: readonly ServiceAgentTool[];
  validatedProposalSettlement?: (input: {
    receiptId: string;
    settlement: OrchestratorResult;
    result: ServiceExecutionResult;
  }) => Promise<OrchestratorResult>;
  dependencyFailurePolicy?: "settle" | "throw";
}

type ResolvedOperation = {
  serviceId: string;
  declaration: ServiceDeclaration;
  invoke: string;
  operation: ServiceOperationDeclaration;
};

type PendingRequest = {
  id: string;
  effect: OrchestratorEffect;
  resolved: ResolvedOperation;
};

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function asRecord(value: Json, label: string): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Declarative service ${label} transform must return an object`);
  }
  return value as Record<string, Json>;
}

function isPatchOp(value: Json): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, Json>;
  return ["set", "merge", "remove"].includes(String(candidate.op)) && typeof candidate.path === "string";
}

function asSettlement(value: Json): OrchestratorResult {
  const mapped = asRecord(value, "settlement");
  const unknown = Object.keys(mapped).filter((key) => !["ops", "events", "outcome", "detail"].includes(key));
  if (unknown.length > 0) throw new Error(`Declarative service settlement has unknown field '${unknown[0]}'`);
  if (mapped.ops !== undefined && (!Array.isArray(mapped.ops) || !mapped.ops.every(isPatchOp))) {
    throw new Error("Declarative service settlement ops must be valid patch operations");
  }
  return mapped as unknown as OrchestratorResult;
}

function errorDetail(error: unknown): Record<string, Json> {
  if (!(error instanceof Error)) return { message: String(error) };
  const detail: Record<string, Json> = { name: error.name, message: error.message };
  for (const field of ["status", "code"] as const) {
    const value = (error as Error & Record<typeof field, unknown>)[field];
    if (typeof value === "string" || typeof value === "number") detail[field] = value;
  }
  if (error instanceof UnsatisfiedServiceDependencyError) {
    detail.dependency = asJson(error.dependency);
  }
  return detail;
}

/** Default host runner for Blueprint-declared services. It is the only layer that materializes
 * adapters, evaluates transforms, validates provider output, and owns request lifecycle. */
export class DefaultServiceHost implements ServiceHost {
  private readonly store: ServiceRequestStore;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly maxAttempts: number;
  private readonly maxGuardrailAttempts: number;
  private readonly agentTools: readonly ServiceAgentTool[];
  private readonly pending: PendingRequest[] = [];
  private readonly controllers = new Map<string, AbortController>();

  constructor(private readonly options: DefaultServiceHostOptions) {
    this.store = options.store ?? new InMemoryServiceRequestStore();
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
    this.maxAttempts = options.maxAttempts ?? 1;
    this.maxGuardrailAttempts = options.maxGuardrailAttempts ?? 2;
    for (const tool of options.agentTools ?? []) {
      if (tool.lifecycle !== "agent") {
        throw new Error(`Service agent tool '${tool.name}' is '${tool.lifecycle}' and cannot execute with agent authority`);
      }
    }
    this.agentTools = [...(options.agentTools ?? [])];
  }

  describeKinds(): ServiceKindDescription[] {
    return this.options.registry.describe();
  }

  async describeServices(): Promise<ServiceCatalogSnapshot[]> {
    return Promise.all(Object.keys(this.options.declarations).map((serviceId) => this.discoverService(serviceId)));
  }

  async validateService(serviceId: string): Promise<ServiceValidationReport> {
    const declaration = this.declaration(serviceId);
    return this.options.registry.validate(declaration);
  }

  async discoverService(serviceId: string): Promise<ServiceCatalogSnapshot> {
    return (await this.adapter(serviceId)).discover();
  }

  async probeService(serviceId: string): Promise<ServiceProbeResult> {
    const adapter = await this.adapter(serviceId);
    return adapter.probe?.({}) ?? { ok: true };
  }

  async preflight(effect: OrchestratorEffect): Promise<ServiceSimulationResult> {
    const resolved = this.resolve(effect);
    const adapter = await this.adapter(resolved.serviceId);
    const input = await this.requestInput(resolved, effect);
    const validation = await adapter.validate?.(input, { effect });
    if (validation && !validation.ok) throw new Error(validation.errors?.join("; ") ?? "Service request validation failed");
    return adapter.simulate?.(input, { effect }) ?? { detail: { supported: false } };
  }

  async invoke(effect: OrchestratorEffect): Promise<OrchestratorResult | void> {
    const resolved = this.resolve(effect);
    if (resolved.operation.mode === "queued") {
      const record = await this.enqueue(effect);
      return { outcome: record.status, detail: { requestId: record.request.id } };
    }
    let completed: ServiceRequestRecord;
    try {
      const record = await this.createRecord(resolved, effect, "immediate");
      completed = await this.execute(record, resolved, effect);
    } catch (error) {
      if (error instanceof UnsatisfiedServiceDependencyError
        && this.options.dependencyFailurePolicy === "throw") {
        throw error;
      }
      if (resolved.operation.failureSettlement) {
        return this.settleFailureError(resolved.operation, error, effect);
      }
      throw error;
    }
    if (completed.status !== "completed" || !completed.result) {
      if (resolved.operation.failureSettlement) {
        return this.settleFailure(resolved.operation, completed, effect);
      }
      throw new Error(completed.error ?? `Service request '${completed.request.id}' ${completed.status}`);
    }
    const settlement = await this.settle(resolved.operation, completed.result, effect);
    const receiptId = completed.result.detail?.proposalReceiptId;
    if (typeof receiptId === "string" && this.options.validatedProposalSettlement) {
      return this.options.validatedProposalSettlement({ receiptId, settlement, result: completed.result });
    }
    return settlement;
  }

  async enqueue(effect: OrchestratorEffect): Promise<ServiceRequestRecord> {
    const resolved = this.resolve(effect);
    const record = await this.createRecord(resolved, effect, "queued");
    this.pending.push({ id: record.request.id, effect, resolved });
    return record;
  }

  async runNext(): Promise<ServiceRequestRecord | undefined> {
    const pending = this.pending.shift();
    if (!pending) return undefined;
    const record = await this.store.get(pending.id);
    if (!record || record.status !== "accepted") return record;
    return this.execute(record, pending.resolved, pending.effect);
  }

  getRequest(id: string): Promise<ServiceRequestRecord | undefined> {
    return Promise.resolve(this.store.get(id));
  }

  listRequests(): Promise<ServiceRequestRecord[]> {
    return Promise.resolve(this.store.list());
  }

  async cancel(id: string): Promise<ServiceRequestRecord> {
    const record = await this.store.get(id);
    if (!record) throw new Error(`Unknown service request '${id}'`);
    if (["completed", "failed", "cancelled", "dead-lettered"].includes(record.status)) return record;
    this.controllers.get(id)?.abort();
    const cancelled = { ...record, status: "cancelled" as const, updatedAt: this.now().toISOString() };
    await this.store.put(cancelled);
    return cancelled;
  }

  private declaration(serviceId: string): ServiceDeclaration {
    const declaration = this.options.declarations[serviceId];
    if (!declaration) throw new Error(`Unknown Blueprint service '${serviceId}'`);
    return declaration;
  }

  private resolve(effect: OrchestratorEffect): ResolvedOperation {
    const invoke = effect.kind === "invoke" ? effect.tool : undefined;
    if (!invoke) throw new Error(`Service host cannot handle '${effect.kind}' effects`);
    for (const [serviceId, declaration] of Object.entries(this.options.declarations)) {
      const operation = declaration.operations[invoke];
      if (operation) return { serviceId, declaration, invoke, operation };
    }
    throw new Error(`No Blueprint service operation is declared for invoke '${invoke}'`);
  }

  private adapter(serviceId: string): Promise<ServiceAdapter> {
    return this.options.registry.materialize({
      blueprintId: this.options.blueprintId,
      blueprintRevision: this.options.blueprintRevision,
      serviceId,
    }, this.declaration(serviceId));
  }

  private async evaluate(expr: string, data: Record<string, unknown>): Promise<Json> {
    return asJson(await this.options.expression.eval(expr, data));
  }

  private async requestInput(resolved: ResolvedOperation, effect: OrchestratorEffect): Promise<ServiceRequestInput> {
    const input = resolved.operation.request?.transform
      ? await this.evaluate(resolved.operation.request.transform.expr, {
          state: this.options.state.snapshot(),
          effect,
        })
      : asJson(effect.args ?? {});
    if (resolved.operation.request?.validators) {
      const report = runDeclarativeValidators(resolved.operation.request.validators, input, {});
      if (!report.ok) throw new Error(`Service request validation failed: ${report.errors.map((issue) => issue.detail).join("; ")}`);
    }
    return {
      service: resolved.serviceId,
      operation: resolved.operation.operation,
      input,
      actorId: effect.actorId,
      blueprintId: this.options.blueprintId,
      blueprintRevision: this.options.blueprintRevision,
      serviceRef: resolved.serviceId,
      subject: resolved.operation.subject,
    };
  }

  private async createRecord(
    resolved: ResolvedOperation,
    effect: OrchestratorEffect,
    mode: "immediate" | "queued"
  ): Promise<ServiceRequestRecord> {
    const input = await this.requestInput(resolved, effect);
    const createdAt = this.now().toISOString();
    const request: ServiceRequest = {
      ...input,
      id: this.idFactory(),
      providerId: (await this.adapter(resolved.serviceId)).provider.id,
      capabilityId: resolved.operation.contract,
      createdAt,
    };
    const record: ServiceRequestRecord = { request, mode, status: "accepted", attempts: 0, updatedAt: createdAt };
    await this.store.put(record);
    return record;
  }

  private async execute(
    record: ServiceRequestRecord,
    resolved: ResolvedOperation,
    effect: OrchestratorEffect
  ): Promise<ServiceRequestRecord> {
    const adapter = await this.adapter(resolved.serviceId);
    const controller = new AbortController();
    this.controllers.set(record.request.id, controller);
    const running = { ...record, status: "running" as const, attempts: record.attempts + 1, updatedAt: this.now().toISOString() };
    await this.store.put(running);
    try {
      const result = await adapter.execute(running.request, {
        signal: controller.signal,
        effect,
        responseValidators: resolved.operation.response?.validators,
        agentTools: this.agentTools,
      });
      return await this.validateResponse(running, result, resolved, effect, adapter, controller);
    } catch (error) {
      const retry = running.mode === "queued" && running.attempts < this.maxAttempts;
      const failed: ServiceRequestRecord = {
        ...running,
        status: retry ? "accepted" : running.mode === "queued" ? "dead-lettered" : "failed",
        error: error instanceof Error ? error.message : String(error),
        errorDetail: errorDetail(error),
        updatedAt: this.now().toISOString(),
      };
      await this.store.put(failed);
      if (running.mode === "immediate"
        && error instanceof UnsatisfiedServiceDependencyError
        && this.options.dependencyFailurePolicy === "throw") {
        throw error;
      }
      if (retry) this.pending.push({ id: running.request.id, effect, resolved });
      return failed;
    } finally {
      this.controllers.delete(record.request.id);
    }
  }

  private async validateResponse(
    running: ServiceRequestRecord,
    result: ServiceExecutionResult,
    resolved: ResolvedOperation,
    effect: OrchestratorEffect,
    adapter: ServiceAdapter,
    controller: AbortController
  ): Promise<ServiceRequestRecord> {
    const response = resolved.operation.response?.transform
      ? await this.evaluate(resolved.operation.response.transform.expr, { response: result.output, effect })
      : result.output;
    const transformed = { ...result, output: response };
    const validators = resolved.operation.response?.validators;
    if (!validators?.length) return this.complete(running, transformed);
    const report = runDeclarativeValidators(validators, response ?? null, {});
    if (report.ok) return this.complete(running, transformed, report.warnings);

    const action = resolved.operation.onViolation ?? { action: "fail" as const };
    const attempts = (running.guardrailAttempts ?? 0) + 1;
    if ((action.action === "retry" || action.action === "correction-prompt")
      && attempts < Math.min(action.maxAttempts ?? 2, this.maxGuardrailAttempts)) {
      const request = action.action === "correction-prompt"
        ? { ...running.request, eventPayload: { ...(running.request.eventPayload ?? {}), guardrailCorrection: { issues: report.errors } as unknown as Json } }
        : running.request;
      const retrying = { ...running, request, guardrailAttempts: attempts, guardrailViolations: report.errors };
      const next = await adapter.execute(request, {
        signal: controller.signal,
        effect,
        responseValidators: validators,
        agentTools: this.agentTools,
      });
      return this.validateResponse(retrying, next, resolved, effect, adapter, controller);
    }
    const failed: ServiceRequestRecord = {
      ...running,
      status: "failed",
      guardrailAttempts: attempts,
      guardrailViolations: report.errors,
      error: `guardrail violation (${action.action}): ${report.errors.map((issue) => issue.detail).join("; ")}`,
      updatedAt: this.now().toISOString(),
    };
    await this.store.put(failed);
    return failed;
  }

  private async complete(
    running: ServiceRequestRecord,
    result: ServiceExecutionResult,
    warnings: readonly { detail: string; code?: string; node?: string }[] = []
  ): Promise<ServiceRequestRecord> {
    const completed: ServiceRequestRecord = {
      ...running,
      status: "completed",
      result: warnings.length ? { ...result, detail: { ...(result.detail ?? {}), guardrailWarnings: warnings as unknown as Json } } : result,
      updatedAt: this.now().toISOString(),
    };
    await this.store.put(completed);
    return completed;
  }

  private async settle(
    operation: ServiceOperationDeclaration,
    result: ServiceExecutionResult,
    effect: OrchestratorEffect
  ): Promise<OrchestratorResult> {
    return asSettlement(await this.evaluate(operation.settlement.transform.expr, {
      state: this.options.state.snapshot(),
      effect,
      response: result.output,
    }));
  }

  private async settleFailure(
    operation: ServiceOperationDeclaration,
    record: ServiceRequestRecord,
    effect: OrchestratorEffect
  ): Promise<OrchestratorResult> {
    return asSettlement(await this.evaluate(operation.failureSettlement!.transform.expr, {
      state: this.options.state.snapshot(),
      effect,
      request: record.request,
      error: record.errorDetail ?? { message: record.error ?? "Service request failed" },
    }));
  }

  private async settleFailureError(
    operation: ServiceOperationDeclaration,
    error: unknown,
    effect: OrchestratorEffect
  ): Promise<OrchestratorResult> {
    return asSettlement(await this.evaluate(operation.failureSettlement!.transform.expr, {
      state: this.options.state.snapshot(),
      effect,
      error: errorDetail(error),
    }));
  }
}
