import { runDeclarativeValidators } from "../../../packages/evaluators/src/index";
import type {
  ExpressionProvider,
  BlueprintServiceDeclaration,
  GuardrailRule,
  Json,
  NativeServiceDeclaration,
  OrchestratorEffect,
  OrchestratorResult,
  ServiceDeclaration,
  ServiceOperationDeclaration,
  StateModel,
} from "../../../kernel/src/index";
import type {
  ServiceAdapter,
  ServiceAgentTool,
  ServiceAgentToolExecutionContext,
  ServiceAgentToolProjection,
  ServiceCatalogSnapshot,
  ServiceExecutionResult,
  ServiceInvocation,
  ServiceInvocationAuthorizationDecision,
  ServiceInvocationAuthorizer,
  ServiceProbeResult,
  ServiceRequest,
  ServiceRequestContext,
  ServiceRequestInput,
  ServiceRequestRecord,
  ServiceRequestStore,
  ServiceSimulationResult,
  ServiceValidationReport,
} from "./queueface";
import { InMemoryServiceRequestStore } from "./queueface";
import {
  UnsatisfiedServiceDependencyError,
  type BlueprintServiceIdentity,
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
  preflight(effect: OrchestratorEffect, context?: ServiceRequestContext): Promise<ServiceSimulationResult>;
  invoke(effect: OrchestratorEffect, context?: ServiceRequestContext): Promise<OrchestratorResult | void>;
  enqueue(effect: OrchestratorEffect, context?: ServiceRequestContext): Promise<ServiceRequestRecord>;
  authorizeInvocation?(invocation: ServiceInvocation): Promise<ServiceInvocationAuthorizationDecision>;
  getRequest(id: string): Promise<ServiceRequestRecord | undefined>;
  listRequests(): Promise<ServiceRequestRecord[]>;
  cancel(id: string): Promise<ServiceRequestRecord>;
}

export interface DefaultServiceHostOptions {
  blueprintId: string;
  blueprintRevision: string;
  declarations: Record<string, ServiceDeclaration>;
  registry: ServiceKindRegistry;
  blueprintServices?: BlueprintServiceResolver;
  state: StateModel;
  expression: ExpressionProvider;
  store?: ServiceRequestStore;
  now?: () => Date;
  idFactory?: () => string;
  maxAttempts?: number;
  maxGuardrailAttempts?: number;
  /** Static tools remain supported; a projection can instead select tools from trusted request context. */
  agentTools?: readonly ServiceAgentTool[] | ServiceAgentToolProjection;
  /** Host policy for concrete service and projected-tool calls. Omission preserves allow-by-default behavior. */
  authorizeInvocation?: ServiceInvocationAuthorizer;
  inProgressProposalSettlement?: (input: {
    proposalScopeId: string;
    settlement: OrchestratorResult;
    result: ServiceExecutionResult;
  }) => Promise<OrchestratorResult>;
  dependencyFailurePolicy?: "settle" | "throw";
}

export interface BlueprintServiceResolver {
  validate?(
    identity: BlueprintServiceIdentity,
    declaration: BlueprintServiceDeclaration,
  ): ServiceValidationReport | Promise<ServiceValidationReport>;
  materialize(
    identity: BlueprintServiceIdentity,
    declaration: BlueprintServiceDeclaration,
  ): ServiceAdapter | Promise<ServiceAdapter>;
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

function deeplyImmutableClone<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== "object" || Object.isFrozen(candidate)) return;
    for (const child of Object.values(candidate)) freeze(child);
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
}

function immutableInvocation(invocation: ServiceInvocation): ServiceInvocation {
  return Object.freeze(invocation.kind === "service-request"
    ? {
        kind: invocation.kind,
        request: deeplyImmutableClone(invocation.request),
      }
    : {
        kind: invocation.kind,
        request: deeplyImmutableClone(invocation.request),
        tool: invocation.tool,
        args: deeplyImmutableClone(invocation.args),
      });
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
  const unknown = Object.keys(mapped).filter((key) => !["ops", "events", "outputs", "outcome", "detail"].includes(key));
  if (unknown.length > 0) throw new Error(`Declarative service settlement has unknown field '${unknown[0]}'`);
  if (mapped.ops !== undefined && (!Array.isArray(mapped.ops) || !mapped.ops.every(isPatchOp))) {
    throw new Error("Declarative service settlement ops must be valid patch operations");
  }
  if (mapped.outputs !== undefined && (!mapped.outputs || typeof mapped.outputs !== "object" || Array.isArray(mapped.outputs))) {
    throw new Error("Declarative service settlement outputs must be an object");
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
    const causeStatus = error.cause && typeof error.cause === "object"
      ? (error.cause as { status?: unknown }).status
      : undefined;
    if (typeof causeStatus === "string" || typeof causeStatus === "number") detail.status = causeStatus;
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
  private readonly agentTools: readonly ServiceAgentTool[] | ServiceAgentToolProjection;
  private readonly pending: PendingRequest[] = [];
  private readonly controllers = new Map<string, AbortController>();

  constructor(private readonly options: DefaultServiceHostOptions) {
    this.store = options.store ?? new InMemoryServiceRequestStore();
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
    this.maxAttempts = options.maxAttempts ?? 1;
    this.maxGuardrailAttempts = options.maxGuardrailAttempts ?? 2;
    if (typeof options.agentTools !== "function") this.validateAgentTools(options.agentTools ?? []);
    this.agentTools = typeof options.agentTools === "function"
      ? options.agentTools
      : [...(options.agentTools ?? [])];
  }

  describeKinds(): ServiceKindDescription[] {
    return this.options.registry.describe();
  }

  async describeServices(): Promise<ServiceCatalogSnapshot[]> {
    return Promise.all(Object.keys(this.options.declarations).map((serviceId) => this.discoverService(serviceId)));
  }

  async validateService(serviceId: string): Promise<ServiceValidationReport> {
    const declaration = this.declaration(serviceId);
    if (isBlueprintService(declaration)) {
      if (!this.options.blueprintServices) {
        return { ok: false, errors: [`No Blueprint service resolver can resolve '${declaration.blueprint.$ref}'`] };
      }
      return this.options.blueprintServices.validate?.(this.identity(serviceId), declaration) ?? { ok: true };
    }
    return this.options.registry.validate(declaration);
  }

  async discoverService(serviceId: string): Promise<ServiceCatalogSnapshot> {
    return (await this.adapter(serviceId)).discover();
  }

  async probeService(serviceId: string): Promise<ServiceProbeResult> {
    const adapter = await this.adapter(serviceId);
    return adapter.probe?.({}) ?? { ok: true };
  }

  async preflight(effect: OrchestratorEffect, context?: ServiceRequestContext): Promise<ServiceSimulationResult> {
    const resolved = this.resolve(effect);
    const adapter = await this.adapter(resolved.serviceId);
    const input = await this.requestInput(resolved, effect, context);
    const validation = await adapter.validate?.(input, { effect });
    if (validation && !validation.ok) throw new Error(validation.errors?.join("; ") ?? "Service request validation failed");
    return adapter.simulate?.(input, { effect }) ?? { detail: { supported: false } };
  }

  async invoke(effect: OrchestratorEffect, context?: ServiceRequestContext): Promise<OrchestratorResult | void> {
    const resolved = this.resolve(effect);
    if (resolved.operation.mode === "queued") {
      const record = await this.enqueue(effect, context);
      return this.requestOutcome(record);
    }
    let completed: ServiceRequestRecord;
    try {
      const record = await this.createRecord(resolved, effect, "immediate", context);
      if (record.status !== "accepted") return this.requestOutcome(record);
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
      if (completed.status === "rejected" || completed.status === "confirmation-required") {
        return this.requestOutcome(completed);
      }
      if (resolved.operation.failureSettlement) {
        return this.settleFailure(resolved.operation, completed, effect);
      }
      throw new Error(
        typeof completed.error === "string"
          ? `Service '${resolved.serviceId}.${resolved.invoke}' request '${completed.request.id}' failed: ${completed.error}`
          : completed.error
            ? JSON.stringify(completed.error)
            : `Service request '${completed.request.id}' ${completed.status}`,
      );
    }
    if (effect.kind === "invoke" && effect.control.sourceId) {
      return { sourceOutput: asJson(completed.result.output ?? null) };
    }
    const settlement = await this.settle(resolved.operation, completed.result, effect);
    if (completed.result.detail?.inProgressProposal === true && this.options.inProgressProposalSettlement) {
      return this.options.inProgressProposalSettlement({
        proposalScopeId: completed.request.id,
        settlement,
        result: completed.result,
      });
    }
    return settlement;
  }

  async enqueue(effect: OrchestratorEffect, context?: ServiceRequestContext): Promise<ServiceRequestRecord> {
    const resolved = this.resolve(effect);
    const record = await this.createRecord(resolved, effect, "queued", context);
    if (record.status === "accepted") this.pending.push({ id: record.request.id, effect, resolved });
    return record;
  }

  async authorizeInvocation(invocation: ServiceInvocation): Promise<ServiceInvocationAuthorizationDecision> {
    if (!this.options.authorizeInvocation) return { outcome: "authorized" };
    let decision: unknown;
    try {
      decision = await this.options.authorizeInvocation(immutableInvocation(invocation));
    } catch {
      return { outcome: "rejected", reason: "authorization-unavailable" };
    }
    return this.authorizationDecision(decision);
  }

  private authorizationDecision(decision: unknown): ServiceInvocationAuthorizationDecision {
    if (!isAuthorizationDecision(decision)) {
      return { outcome: "rejected", reason: "authorization-unavailable" };
    }
    if (decision.outcome === "authorized" && decision.validUntil !== undefined) {
      const validUntil = Date.parse(decision.validUntil);
      if (!Number.isFinite(validUntil) || validUntil <= this.now().getTime()) {
        return { outcome: "rejected", reason: "authorization-stale" };
      }
    }
    return decision;
  }

  async runNext(): Promise<ServiceRequestRecord | undefined> {
    const pending = this.pending.shift();
    if (!pending) return undefined;
    const record = await this.store.get(pending.id);
    if (!record || record.status !== "accepted") return record;
    if (this.options.authorizeInvocation) {
      const authorization = this.authorizationDecision(record.authorization);
      if (authorization.outcome !== "authorized") {
        const rejected: ServiceRequestRecord = {
          ...record,
          status: authorization.outcome,
          authorization,
          updatedAt: this.now().toISOString(),
        };
        await this.store.put(rejected);
        return rejected;
      }
    }
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
    if (["completed", "failed", "cancelled", "dead-lettered", "rejected", "confirmation-required"].includes(record.status)) {
      return record;
    }
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
    const invoke = effect.kind === "invoke" ? effect.control.tool : undefined;
    if (!invoke) throw new Error(`Service host cannot handle '${effect.kind}' effects`);
    if (effect.kind === "invoke" && effect.control.serviceRef) {
      const serviceId = effect.control.serviceRef;
      const declaration = this.declaration(serviceId);
      const operation = declaration.operations[invoke];
      if (!operation) {
        throw new Error(`Blueprint service '${serviceId}' does not declare invoke '${invoke}'`);
      }
      return { serviceId, declaration, invoke, operation };
    }
    for (const [serviceId, declaration] of Object.entries(this.options.declarations)) {
      const operation = declaration.operations[invoke];
      if (operation) return { serviceId, declaration, invoke, operation };
    }
    throw new Error(`No Blueprint service operation is declared for invoke '${invoke}'`);
  }

  private adapter(serviceId: string): Promise<ServiceAdapter> {
    const identity = this.identity(serviceId);
    const declaration = this.declaration(serviceId);
    if (isBlueprintService(declaration)) {
      if (!this.options.blueprintServices) {
        throw new Error(`No Blueprint service resolver can resolve '${declaration.blueprint.$ref}'`);
      }
      return Promise.resolve(this.options.blueprintServices.materialize(identity, declaration));
    }
    return this.options.registry.materialize(identity, declaration);
  }

  private identity(serviceId: string): BlueprintServiceIdentity {
    return {
      blueprintId: this.options.blueprintId,
      blueprintRevision: this.options.blueprintRevision,
      serviceId,
    };
  }

  private async evaluate(expr: string, data: Record<string, unknown>): Promise<Json> {
    const state = data.state;
    const evaluationData = state && typeof state === "object" && !Array.isArray(state)
      ? { ...state, ...data, state }
      : data;
    return asJson(await this.options.expression.eval(expr, evaluationData));
  }

  private async requestInput(
    resolved: ResolvedOperation,
    effect: OrchestratorEffect,
    context?: ServiceRequestContext
  ): Promise<ServiceRequestInput> {
    const input = resolved.operation.request?.transform
      ? await this.evaluate(resolved.operation.request.transform.expr, {
          state: this.options.state.snapshot(),
          effect,
          input: effect.data,
        })
      : asJson(effect.data);
    if (resolved.operation.request?.validators) {
      const validatorInput = resolved.operation.request.validatorInput
        ? await this.evaluate(resolved.operation.request.validatorInput.expr, {
            state: this.options.state.snapshot(),
            effect,
            input,
          })
        : input;
      const report = runDeclarativeValidators(resolved.operation.request.validators, validatorInput, {});
      if (!report.ok) throw new Error(`Service request validation failed: ${report.errors.map((issue) => issue.detail).join("; ")}`);
    }
    return {
      service: resolved.serviceId,
      operation: resolved.operation.operation,
      input,
      actorId: context?.actorId ?? effect.actorId,
      ...(context?.correlationId !== undefined ? { correlationId: context.correlationId } : {}),
      ...(context?.idempotencyKey !== undefined ? { idempotencyKey: context.idempotencyKey } : {}),
      ...(context?.deadline !== undefined ? { deadline: context.deadline } : {}),
      blueprintId: this.options.blueprintId,
      blueprintRevision: this.options.blueprintRevision,
      serviceRef: resolved.serviceId,
      subject: resolved.operation.subject,
    };
  }

  private async createRecord(
    resolved: ResolvedOperation,
    effect: OrchestratorEffect,
    mode: "immediate" | "queued",
    context?: ServiceRequestContext
  ): Promise<ServiceRequestRecord> {
    const input = await this.requestInput(resolved, effect, context);
    const createdAt = this.now().toISOString();
    const request: ServiceRequest = {
      ...input,
      id: this.idFactory(),
      providerId: (await this.adapter(resolved.serviceId)).provider.id,
      capabilityId: resolved.operation.contract,
      createdAt,
    };
    const authorization = await this.authorizeInvocation({ kind: "service-request", request });
    const status = authorization.outcome === "authorized" ? "accepted" : authorization.outcome;
    const record: ServiceRequestRecord = {
      request,
      mode,
      status,
      attempts: 0,
      updatedAt: createdAt,
      ...(this.options.authorizeInvocation ? { authorization } : {}),
    };
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
      const trustedRequest = deeplyImmutableClone(running.request);
      const result = await adapter.execute(structuredClone(running.request), {
        signal: controller.signal,
        effect,
        responseValidators: this.responseValidatorsFor(resolved, effect),
        agentTools: this.projectAgentTools(trustedRequest, controller.signal),
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

  /** The operation's own `response.validators`, plus any per-usage-site `CellSource.acceptanceCriteria`
   * the invoking Cell declared -- additive checks, gated by the same operation `onViolation` (there is
   * no separate acceptance-criteria policy authority). */
  private responseValidatorsFor(resolved: ResolvedOperation, effect: OrchestratorEffect): readonly GuardrailRule[] {
    const cellAcceptanceCriteria = effect.kind === "invoke" ? effect.control.sourceAcceptanceCriteria : undefined;
    return [...(resolved.operation.response?.validators ?? []), ...(cellAcceptanceCriteria ?? [])];
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
    const validators = this.responseValidatorsFor(resolved, effect);
    if (!validators.length) return this.complete(running, transformed);
    const report = runDeclarativeValidators(validators, response ?? null, {
      bindings: { request: running.request.input ?? null },
    });
    if (report.ok) return this.complete(running, transformed, report.warnings);

    const action = resolved.operation.onViolation ?? { action: "fail" as const };
    const attempts = (running.guardrailAttempts ?? 0) + 1;
    if ((action.action === "retry" || action.action === "correction-prompt")
      && attempts < Math.min(action.maxAttempts ?? 2, this.maxGuardrailAttempts)) {
      const request = action.action === "correction-prompt"
        ? { ...running.request, eventPayload: { ...(running.request.eventPayload ?? {}), guardrailCorrection: { issues: report.errors } as unknown as Json } }
        : running.request;
      const trustedRequest = deeplyImmutableClone(request);
      let retrying: ServiceRequestRecord = {
        ...running,
        request,
        guardrailAttempts: attempts,
        guardrailViolations: report.errors,
      };
      if (this.options.authorizeInvocation) {
        const authorization = await this.authorizeInvocation({
          kind: "service-request",
          request: trustedRequest,
        });
        retrying = { ...retrying, authorization };
        if (authorization.outcome !== "authorized") {
          const rejected: ServiceRequestRecord = {
            ...retrying,
            status: authorization.outcome,
            updatedAt: this.now().toISOString(),
          };
          await this.store.put(rejected);
          return rejected;
        }
      }
      const next = await adapter.execute(structuredClone(request), {
        signal: controller.signal,
        effect,
        responseValidators: validators,
        agentTools: this.projectAgentTools(trustedRequest, controller.signal),
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

  private requestOutcome(record: ServiceRequestRecord): OrchestratorResult {
    return {
      outcome: record.status,
      detail: {
        requestId: record.request.id,
        ...(record.authorization?.outcome !== "authorized"
          ? {
              ...(record.authorization?.detail ?? {}),
              reason: record.authorization?.reason ?? "authorization-unavailable",
            }
          : {}),
      },
    };
  }

  private validateAgentTools(tools: readonly ServiceAgentTool[]): void {
    const names = new Set<string>();
    for (const tool of tools) {
      if (tool.lifecycle !== "agent") {
        throw new Error(`Service agent tool '${tool.name}' is '${tool.lifecycle}' and cannot execute with agent authority`);
      }
      if (names.has(tool.name)) throw new Error(`Duplicate service agent tool '${tool.name}'`);
      names.add(tool.name);
    }
  }

  private projectAgentTools(
    request: Readonly<ServiceRequest>,
    signal: AbortSignal
  ): readonly ServiceAgentTool[] {
    const context: ServiceAgentToolExecutionContext = Object.freeze({
      requestId: request.id,
      service: request.service,
      operation: request.operation,
      providerId: request.providerId,
      capabilityId: request.capabilityId,
      blueprintId: request.blueprintId,
      blueprintRevision: request.blueprintRevision,
      serviceRef: request.serviceRef,
      actorId: request.actorId,
      correlationId: request.correlationId,
      idempotencyKey: request.idempotencyKey,
      deadline: request.deadline,
      signal,
    });
    const projected = typeof this.agentTools === "function"
      ? this.agentTools(context)
      : this.agentTools;
    this.validateAgentTools(projected);
    return projected.map((tool) => {
      if (!this.options.authorizeInvocation) {
        return { ...tool, handler: (args: unknown) => tool.handler(args, context) };
      }
      return {
        ...tool,
        handler: async (args: unknown) => {
          const trustedArgs = deeplyImmutableClone(args);
          const decision = await this.authorizeInvocation({
            kind: "agent-tool",
            request,
            tool: tool.name,
            args: trustedArgs,
          });
          if (decision.outcome !== "authorized") {
            return {
              outcome: decision.outcome,
              detail: {
                ...(decision.detail ?? {}),
                reason: decision.reason,
              },
            };
          }
          return tool.handler(trustedArgs, context);
        },
      };
    });
  }
}

function isBlueprintService(
  declaration: ServiceDeclaration,
): declaration is BlueprintServiceDeclaration {
  return "blueprint" in declaration;
}

function isAuthorizationDecision(value: unknown): value is ServiceInvocationAuthorizationDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const decision = value as Partial<ServiceInvocationAuthorizationDecision>;
  if (decision.outcome === "authorized") {
    return decision.validUntil === undefined || typeof decision.validUntil === "string";
  }
  return (decision.outcome === "rejected" || decision.outcome === "confirmation-required")
    && typeof decision.reason === "string";
}
