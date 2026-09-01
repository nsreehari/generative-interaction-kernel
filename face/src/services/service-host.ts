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
  ServiceSubject,
  StateModel,
} from "../../../kernel/src/index";
import type {
  AuthorityBoundary,
  InvocationAuthorityProfile,
  InvocationAuthorizationSnapshot,
  InvocationAuthorizationTarget,
  ServiceAdapter,
  ServiceAgentTool,
  ServiceAgentToolExecutionContext,
  ServiceAgentToolProjection,
  ServiceCatalogSnapshot,
  ServiceConfirmationRequestIntent,
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
  /** Host-authored, request-scoped authorization context built once per service request (at
   * pre-materialization) and reused -- immutably -- across every later authorization checkpoint
   * for that request. Requires `authorizeInvocation`; a snapshot with nothing to enforce it
   * against is a configuration error. A builder that throws, or returns a value that fails
   * structural validation (an unrecognized authority profile, a missing policy/profile
   * revision, and so on), fails the whole invocation closed. */
  authorizationSnapshot?: (input: {
    request: Readonly<PreMaterializationServiceRequest>;
    context?: ServiceRequestContext;
  }) => InvocationAuthorizationSnapshot | Promise<InvocationAuthorizationSnapshot>;
  /** Cheap, live kill-switch read consulted at every authorization checkpoint (pre-materialization,
   * execution, agent-tool, guardrail retry, and queued dequeue), independent of any cached
   * authorization snapshot. A throwing or unavailable kill-switch fails closed (treated as
   * engaged), matching "reactivation does not revive stale actions automatically". */
  killSwitch?: () => boolean | Promise<boolean>;
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
  adapter?: ServiceAdapter;
};

type PreMaterializationServiceRequest = Omit<ServiceRequest, "providerId">;

type InvocationLifetime = {
  readonly controller: AbortController;
  active: boolean;
};

class ServiceExecutionAttemptError extends Error {
  constructor(
    readonly original: unknown,
    readonly record: ServiceRequestRecord
  ) {
    super(original instanceof Error ? original.message : String(original));
  }
}

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
  const authorizationSnapshot = invocation.authorizationSnapshot
    ? deeplyImmutableClone(invocation.authorizationSnapshot)
    : undefined;
  if (invocation.kind === "service-request") {
    if (invocation.phase === "pre-materialization") {
      return Object.freeze({
        kind: invocation.kind,
        phase: invocation.phase,
        request: deeplyImmutableClone(invocation.request),
        ...(authorizationSnapshot ? { authorizationSnapshot } : {}),
      });
    }
    return Object.freeze({
      kind: invocation.kind,
      phase: invocation.phase,
      request: deeplyImmutableClone(invocation.request),
      ...(authorizationSnapshot ? { authorizationSnapshot } : {}),
    });
  }
  return Object.freeze({
    kind: invocation.kind,
    request: deeplyImmutableClone(invocation.request),
    tool: invocation.tool,
    args: deeplyImmutableClone(invocation.args),
    ...(authorizationSnapshot ? { authorizationSnapshot } : {}),
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
    if (options.authorizationSnapshot && !options.authorizeInvocation) {
      throw new Error("'authorizationSnapshot' requires 'authorizeInvocation'; a snapshot with nothing to enforce it is a configuration error");
    }
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
    const trustedEffect = deeplyImmutableClone(effect);
    const resolved = this.resolve(trustedEffect);
    const adapter = await this.adapter(resolved.serviceId);
    const input = await this.requestInput(resolved, trustedEffect, context);
    const validation = await adapter.validate?.(structuredClone(input), { effect: structuredClone(trustedEffect) });
    if (validation && !validation.ok) throw new Error(validation.errors?.join("; ") ?? "Service request validation failed");
    return adapter.simulate?.(structuredClone(input), { effect: structuredClone(trustedEffect) })
      ?? { detail: { supported: false } };
  }

  async invoke(effect: OrchestratorEffect, context?: ServiceRequestContext): Promise<OrchestratorResult | void> {
    const trustedEffect = deeplyImmutableClone(effect);
    const resolved = this.resolve(trustedEffect);
    if (resolved.operation.mode === "queued") {
      const record = await this.enqueue(trustedEffect, context);
      return this.requestOutcome(record);
    }
    let completed: ServiceRequestRecord;
    try {
      const record = await this.createRecord(resolved, trustedEffect, "immediate", context);
      if (record.status !== "accepted") return this.requestOutcome(record);
      completed = await this.execute(record, resolved, trustedEffect);
    } catch (error) {
      if (error instanceof UnsatisfiedServiceDependencyError
        && this.options.dependencyFailurePolicy === "throw") {
        throw error;
      }
      if (resolved.operation.failureSettlement) {
        return this.settleFailureError(resolved.operation, error, trustedEffect);
      }
      throw error;
    }
    if (completed.status !== "completed" || !completed.result) {
      if (completed.status === "rejected" || completed.status === "confirmation-required") {
        return this.requestOutcome(completed);
      }
      if (resolved.operation.failureSettlement) {
        return this.settleFailure(resolved.operation, completed, trustedEffect);
      }
      throw new Error(
        typeof completed.error === "string"
          ? `Service '${resolved.serviceId}.${resolved.invoke}' request '${completed.request.id}' failed: ${completed.error}`
          : completed.error
            ? JSON.stringify(completed.error)
            : `Service request '${completed.request.id}' ${completed.status}`,
      );
    }
    if (trustedEffect.kind === "invoke" && trustedEffect.control.sourceId) {
      return { sourceOutput: asJson(completed.result.output ?? null) };
    }
    const settlement = await this.settle(resolved.operation, completed.result, trustedEffect);
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
    const trustedEffect = deeplyImmutableClone(effect);
    const resolved = this.resolve(trustedEffect);
    const record = await this.createRecord(resolved, trustedEffect, "queued", context);
    if (record.status === "accepted") {
      this.pending.push({
        id: record.request.id,
        effect: trustedEffect,
        resolved,
      });
    }
    return record;
  }

  async authorizeInvocation(
    invocation: ServiceInvocation,
    snapshot?: InvocationAuthorizationSnapshot
  ): Promise<ServiceInvocationAuthorizationDecision> {
    if (await this.killSwitchEngaged()) {
      return { outcome: "rejected", reason: "kill-switch-engaged" };
    }
    if (snapshot) {
      const snapshotRejection = this.checkSnapshot(snapshot, invocation.request);
      if (snapshotRejection) return snapshotRejection;
    }
    if (!this.options.authorizeInvocation) return { outcome: "authorized" };
    const enriched: ServiceInvocation = snapshot
      ? ({ ...invocation, authorizationSnapshot: snapshot } as ServiceInvocation)
      : invocation;
    let decision: unknown;
    try {
      decision = await this.options.authorizeInvocation(immutableInvocation(enriched));
    } catch {
      return { outcome: "rejected", reason: "authorization-unavailable" };
    }
    return this.authorizationDecision(decision);
  }

  /** Fresh, cheap checks run at every authorization checkpoint against the immutable
   * per-request snapshot: expiry, the idempotency requirement, and target-revision drift. These
   * never depend on the configured `authorizeInvocation` policy function, so they cannot be
   * bypassed by a permissive or buggy policy. */
  private checkSnapshot(
    snapshot: InvocationAuthorizationSnapshot,
    request: Readonly<ServiceRequestInput>
  ): Extract<ServiceInvocationAuthorizationDecision, { outcome: "rejected" }> | undefined {
    if (snapshot.expiresAt !== undefined) {
      const expiresAt = Date.parse(snapshot.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= this.now().getTime()) {
        return { outcome: "rejected", reason: "authorization-snapshot-expired" };
      }
    }
    if (snapshot.requiresIdempotencyKey && !request.idempotencyKey) {
      return { outcome: "rejected", reason: "idempotency-key-required" };
    }
    if (snapshot.approvedTarget) {
      const target = request.target;
      if (!target
        || target.ref !== snapshot.approvedTarget.ref
        || (snapshot.approvedTarget.revision !== undefined
          && target.revision !== snapshot.approvedTarget.revision)) {
        return { outcome: "rejected", reason: "approval-target-mismatch" };
      }
    }
    return undefined;
  }

  /** A throwing or unavailable kill-switch fails closed (treated as engaged): the kill switch is
   * a floor that must cover all activity, independent of whether a richer `authorizeInvocation`
   * policy is even configured. */
  private async killSwitchEngaged(): Promise<boolean> {
    if (!this.options.killSwitch) return false;
    try {
      return await this.options.killSwitch();
    } catch {
      return true;
    }
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

  private async revalidateExecutionAuthorization(
    record: ServiceRequestRecord
  ): Promise<ServiceRequestRecord> {
    if (await this.killSwitchEngaged()) {
      return this.storeRejection(record, { outcome: "rejected", reason: "kill-switch-engaged" });
    }
    if (record.authorizationSnapshot) {
      const rejection = this.checkSnapshot(record.authorizationSnapshot, record.request);
      if (rejection) return this.storeRejection(record, rejection);
    }
    if (!this.options.authorizeInvocation) return record;
    const authorization = this.authorizationDecision(record.authorization);
    if (authorization.outcome === "authorized") return record;
    return this.storeRejection(record, authorization);
  }

  private async storeRejection(
    record: ServiceRequestRecord,
    authorization: Extract<ServiceInvocationAuthorizationDecision, { outcome: "rejected" | "confirmation-required" }>
  ): Promise<ServiceRequestRecord> {
    const rejected: ServiceRequestRecord = {
      ...record,
      status: authorization.outcome,
      authorization,
      updatedAt: this.now().toISOString(),
    };
    await this.store.put(rejected);
    return rejected;
  }

  async runNext(): Promise<ServiceRequestRecord | undefined> {
    const pending = this.pending.shift();
    if (!pending) return undefined;
    const record = await this.store.get(pending.id);
    if (!record || record.status !== "accepted") return record;
    if (this.options.authorizeInvocation || this.options.killSwitch) {
      const authorized = await this.revalidateExecutionAuthorization(record);
      if (authorized.status !== "accepted") return authorized;
    }
    return this.execute(record, pending.resolved, pending.effect, pending.adapter);
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
    const matches = Object.entries(this.options.declarations)
      .filter(([, declaration]) => declaration.operations[invoke]);
    if (matches.length === 0) {
      throw new Error(`No Blueprint service operation is declared for invoke '${invoke}'`);
    }
    if (matches.length > 1) {
      // Fail closed rather than silently binding to whichever service happens to be enumerated
      // first: an ambiguous target must be disambiguated by the caller, not guessed by the host.
      throw new Error(
        `Invoke '${invoke}' is ambiguous across services [${matches.map(([serviceId]) => serviceId).join(", ")}]; specify 'serviceRef' to disambiguate`
      );
    }
    const [serviceId, declaration] = matches[0]!;
    return { serviceId, declaration, invoke, operation: declaration.operations[invoke]! };
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
      ...(context?.target !== undefined ? { target: context.target } : {}),
      blueprintId: this.options.blueprintId,
      blueprintRevision: this.options.blueprintRevision,
      serviceRef: resolved.serviceId,
      subject: resolved.operation.subject,
    };
  }

  /** Whether to persist an authorization decision on the record: always when a custom policy is
   * configured (existing behavior, including successful `authorized` decisions with metadata such
   * as `validUntil`), and also whenever the decision itself is not a trivial "authorized" outcome
   * -- for example a kill-switch rejection that fires even with no policy configured at all. */
  private authorizationField(
    authorization: ServiceInvocationAuthorizationDecision
  ): { authorization?: ServiceInvocationAuthorizationDecision } {
    return this.options.authorizeInvocation || authorization.outcome !== "authorized"
      ? { authorization }
      : {};
  }

  private async createRecord(
    resolved: ResolvedOperation,
    effect: OrchestratorEffect,
    mode: "immediate" | "queued",
    context?: ServiceRequestContext
  ): Promise<ServiceRequestRecord> {
    const input = await this.requestInput(resolved, effect, context);
    const createdAt = this.now().toISOString();
    const authorizationRequest: PreMaterializationServiceRequest = {
      ...input,
      id: this.idFactory(),
      capabilityId: resolved.operation.contract,
      createdAt,
    };
    const { snapshot, failed } = await this.buildAuthorizationSnapshot(authorizationRequest, context);
    const authorization = failed
      ? { outcome: "rejected" as const, reason: "authorization-unavailable" }
      : await this.authorizeInvocation({
          kind: "service-request",
          phase: "pre-materialization",
          request: authorizationRequest,
        }, snapshot);
    const status = authorization.outcome === "authorized" ? "accepted" : authorization.outcome;
    const request: ServiceRequest = {
      ...authorizationRequest,
      providerId: `declared:${resolved.serviceId}`,
    };
    const record: ServiceRequestRecord = {
      request,
      mode,
      status,
      attempts: 0,
      updatedAt: createdAt,
      ...this.authorizationField(authorization),
      ...(snapshot ? { authorizationSnapshot: snapshot } : {}),
    };
    await this.store.put(record);
    return record;
  }

  /** Builds the immutable, request-scoped authorization snapshot once (if a builder is
   * configured). A builder that throws or returns a structurally invalid snapshot -- an
   * unrecognized authority profile, a missing policy/profile revision, and so on -- fails the
   * whole invocation closed rather than proceeding without one. */
  private async buildAuthorizationSnapshot(
    request: Readonly<PreMaterializationServiceRequest>,
    context?: ServiceRequestContext
  ): Promise<{ snapshot?: InvocationAuthorizationSnapshot; failed: boolean }> {
    if (!this.options.authorizationSnapshot) return { failed: false };
    let built: unknown;
    try {
      built = await this.options.authorizationSnapshot({ request, context });
    } catch {
      return { failed: true };
    }
    if (!isAuthorizationSnapshot(built)) return { failed: true };
    return { snapshot: deeplyImmutableClone(built), failed: false };
  }

  private async execute(
    record: ServiceRequestRecord,
    resolved: ResolvedOperation,
    effect: OrchestratorEffect,
    boundAdapter?: ServiceAdapter
  ): Promise<ServiceRequestRecord> {
    let adapter = boundAdapter;
    let active: ServiceRequestRecord = {
      ...record,
      status: "running" as const,
      attempts: record.attempts + 1,
      updatedAt: this.now().toISOString(),
    };
    try {
      await this.store.put(active);
      adapter ??= await this.adapter(resolved.serviceId);
      const request: ServiceRequest = {
        ...active.request,
        providerId: adapter.provider.id,
      };
      const authorization = await this.authorizeInvocation({
        kind: "service-request",
        phase: "execution",
        request,
      }, active.authorizationSnapshot);
      active = {
        ...active,
        request,
        status: authorization.outcome === "authorized" ? active.status : authorization.outcome,
        ...this.authorizationField(authorization),
        updatedAt: this.now().toISOString(),
      };
      await this.store.put(active);
      if (active.status === "rejected" || active.status === "confirmation-required") {
        return active;
      }
      const attempt = await this.executeAdapterAttempt(
        adapter,
        active,
        effect,
        this.responseValidatorsFor(resolved, effect),
      );
      if (!attempt.result) return attempt.record;
      return await this.validateResponse(attempt.record, attempt.result, resolved, effect, adapter);
    } catch (error) {
      const original = error instanceof ServiceExecutionAttemptError ? error.original : error;
      const failedAttempt = error instanceof ServiceExecutionAttemptError ? error.record : active;
      const retry = failedAttempt.mode === "queued" && failedAttempt.attempts < this.maxAttempts;
      const failed: ServiceRequestRecord = {
        ...failedAttempt,
        status: retry ? "accepted" : failedAttempt.mode === "queued" ? "dead-lettered" : "failed",
        error: original instanceof Error ? original.message : String(original),
        errorDetail: errorDetail(original),
        updatedAt: this.now().toISOString(),
      };
      await this.store.put(failed);
      if (failedAttempt.mode === "immediate"
        && original instanceof UnsatisfiedServiceDependencyError
        && this.options.dependencyFailurePolicy === "throw") {
        throw original;
      }
      if (retry) this.pending.push({ id: failedAttempt.request.id, effect, resolved, adapter });
      return failed;
    }
  }

  private async executeAdapterAttempt(
    adapter: ServiceAdapter,
    record: ServiceRequestRecord,
    effect: OrchestratorEffect,
    validators: readonly GuardrailRule[]
  ): Promise<{ record: ServiceRequestRecord; result?: ServiceExecutionResult }> {
    const controller = new AbortController();
    const lifetime: InvocationLifetime = { controller, active: true };
    this.controllers.set(record.request.id, controller);
    try {
      const trustedRequest = deeplyImmutableClone(record.request);
      const adapterRequest = structuredClone(record.request);
      const adapterContext = {
        signal: controller.signal,
        effect: structuredClone(effect),
        responseValidators: structuredClone(validators),
        agentTools: this.projectAgentTools(trustedRequest, lifetime, record.authorizationSnapshot),
      };
      const immediatelyAuthorized = await this.revalidateExecutionAuthorization(record);
      if (immediatelyAuthorized.status === "rejected"
        || immediatelyAuthorized.status === "confirmation-required") {
        return { record: immediatelyAuthorized };
      }
      const result = await adapter.execute(adapterRequest, adapterContext);
      return { record, result };
    } finally {
      lifetime.active = false;
      if (!controller.signal.aborted) controller.abort();
      if (this.controllers.get(record.request.id) === controller) {
        this.controllers.delete(record.request.id);
      }
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
    adapter: ServiceAdapter
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
      if (this.options.authorizeInvocation || this.options.killSwitch) {
        const authorization = await this.authorizeInvocation({
          kind: "service-request",
          phase: "execution",
          request: trustedRequest,
        }, running.authorizationSnapshot);
        retrying = { ...retrying, ...this.authorizationField(authorization) };
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
      await this.store.put(retrying);
      let next: { record: ServiceRequestRecord; result?: ServiceExecutionResult };
      try {
        next = await this.executeAdapterAttempt(adapter, retrying, effect, validators);
      } catch (error) {
        throw new ServiceExecutionAttemptError(error, retrying);
      }
      if (!next.result) return next.record;
      try {
        return await this.validateResponse(next.record, next.result, resolved, effect, adapter);
      } catch (error) {
        if (error instanceof ServiceExecutionAttemptError) throw error;
        throw new ServiceExecutionAttemptError(error, retrying);
      }
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
    const authorization = record.authorization;
    return {
      outcome: record.status,
      detail: {
        requestId: record.request.id,
        ...(authorization?.outcome !== "authorized"
          ? {
              ...(authorization?.detail ?? {}),
              reason: authorization?.reason ?? "authorization-unavailable",
              ...(authorization?.outcome === "confirmation-required" && authorization.requestIntent
                ? { requestIntent: asJson(authorization.requestIntent) }
                : {}),
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
    lifetime: InvocationLifetime,
    snapshot?: InvocationAuthorizationSnapshot
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
      signal: lifetime.controller.signal,
    });
    const projected = typeof this.agentTools === "function"
      ? this.agentTools(context)
      : this.agentTools;
    this.validateAgentTools(projected);
    const authorizationEnforced = Boolean(this.options.authorizeInvocation) || Boolean(this.options.killSwitch);
    return projected.map((tool) => {
      if (!authorizationEnforced) {
        return {
          ...tool,
          handler: (args: unknown) => this.invocationActive(lifetime)
            ? tool.handler(args, context)
            : this.inactiveInvocationResult(),
        };
      }
      return {
        ...tool,
        handler: async (args: unknown) => {
          if (!this.invocationActive(lifetime)) return this.inactiveInvocationResult();
          const trustedArgs = deeplyImmutableClone(args);
          const decision = await this.authorizeInvocation({
            kind: "agent-tool",
            request,
            tool: tool.name,
            args: trustedArgs,
          }, snapshot);
          if (!this.invocationActive(lifetime)) return this.inactiveInvocationResult();
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

  private invocationActive(lifetime: InvocationLifetime): boolean {
    return lifetime.active && !lifetime.controller.signal.aborted;
  }

  private inactiveInvocationResult(): Record<string, Json> {
    return {
      outcome: "rejected",
      detail: { reason: "invocation-inactive" },
    };
  }
}

function isBlueprintService(
  declaration: ServiceDeclaration,
): declaration is BlueprintServiceDeclaration {
  return "blueprint" in declaration;
}

function isServiceSubject(value: unknown): value is ServiceSubject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const subject = value as Record<string, unknown>;
  if (typeof subject.blueprintId !== "string") return false;
  switch (subject.kind) {
    case "cell":
      return typeof subject.cellId === "string";
    case "substrate-agent":
      return typeof subject.actorId === "string";
    case "chat":
      return typeof subject.turnId === "string";
    case "task":
      return typeof subject.taskId === "string";
    default:
      return false;
  }
}

function isPlainRecord(value: unknown): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isServiceConfirmationRequestIntent(value: unknown): value is ServiceConfirmationRequestIntent {
  if (!isPlainRecord(value)) return false;
  if (!hasOnlyKeys(value, ["requestType", "context", "subject"])) return false;
  if (typeof value.requestType !== "string" || value.requestType.length === 0) return false;
  if (value.context !== undefined && !isPlainRecord(value.context)) return false;
  if (value.subject !== undefined && !isServiceSubject(value.subject)) return false;
  return true;
}

/** A decision is only ever trusted structurally: rejecting on any unrecognized field or shape
 * means a misbehaving or misconfigured policy function fails the invocation closed instead of
 * silently widening it (for example, by smuggling a recipient/channel into `requestIntent`). */
function isAuthorizationDecision(value: unknown): value is ServiceInvocationAuthorizationDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const decision = value as Partial<ServiceInvocationAuthorizationDecision> & { requestIntent?: unknown };
  if (decision.outcome === "authorized") {
    if (!hasOnlyKeys(decision as Record<string, unknown>, ["outcome", "validUntil", "detail"])) return false;
    return decision.validUntil === undefined || typeof decision.validUntil === "string";
  }
  if (decision.outcome === "rejected") {
    if (!hasOnlyKeys(decision as Record<string, unknown>, ["outcome", "reason", "detail"])) return false;
    return typeof decision.reason === "string";
  }
  if (decision.outcome === "confirmation-required") {
    if (!hasOnlyKeys(decision as Record<string, unknown>, ["outcome", "reason", "requestIntent", "detail"])) return false;
    if (typeof decision.reason !== "string") return false;
    return decision.requestIntent === undefined || isServiceConfirmationRequestIntent(decision.requestIntent);
  }
  return false;
}

function isAuthorityBoundary(value: unknown): value is AuthorityBoundary {
  if (!isPlainRecord(value)) return false;
  if (!hasOnlyKeys(value, ["scope", "detail"])) return false;
  if (!["none", "read", "propose", "apply"].includes(String(value.scope))) return false;
  return value.detail === undefined || isPlainRecord(value.detail);
}

const AUTHORITY_PROFILE_BOUNDARY_KEYS = [
  "observation",
  "planState",
  "memory",
  "producerArtifact",
  "domainEffects",
] as const;

function isInvocationAuthorityProfile(value: unknown): value is InvocationAuthorityProfile {
  if (!isPlainRecord(value)) return false;
  if (!hasOnlyKeys(value, ["id", ...AUTHORITY_PROFILE_BOUNDARY_KEYS])) return false;
  if (typeof value.id !== "string" || value.id.length === 0) return false;
  return AUTHORITY_PROFILE_BOUNDARY_KEYS.every((key) => isAuthorityBoundary(value[key]));
}

function isInvocationAuthorizationTarget(value: unknown): value is InvocationAuthorizationTarget {
  if (!isPlainRecord(value)) return false;
  if (!hasOnlyKeys(value, ["ref", "revision"])) return false;
  if (typeof value.ref !== "string" || value.ref.length === 0) return false;
  return value.revision === undefined || typeof value.revision === "string";
}

const AUTHORIZATION_SNAPSHOT_KEYS = [
  "issuedAt",
  "expiresAt",
  "subject",
  "actorId",
  "authorityProfile",
  "authorityProfileRevision",
  "policyRevision",
  "grantRevision",
  "killSwitchEngaged",
  "requiresIdempotencyKey",
  "approvedTarget",
  "approvalRef",
  "budget",
  "detail",
] as const;

/** Structural validation only -- this host has no opinion on what a valid policy/grant revision
 * or authority-profile id *means*; it only guarantees the shape a policy function relies on is
 * actually present. An authorization snapshot builder that returns anything else (or throws)
 * fails the whole invocation closed rather than authorizing with missing/ambiguous context. */
function isAuthorizationSnapshot(value: unknown): value is InvocationAuthorizationSnapshot {
  if (!isPlainRecord(value)) return false;
  if (!hasOnlyKeys(value, AUTHORIZATION_SNAPSHOT_KEYS)) return false;
  if (typeof value.issuedAt !== "string") return false;
  if (value.expiresAt !== undefined && typeof value.expiresAt !== "string") return false;
  if (value.subject !== undefined && !isServiceSubject(value.subject)) return false;
  if (value.actorId !== undefined && typeof value.actorId !== "string") return false;
  if (typeof value.authorityProfileRevision !== "string" || value.authorityProfileRevision.length === 0) return false;
  if (typeof value.policyRevision !== "string" || value.policyRevision.length === 0) return false;
  if (value.grantRevision !== undefined && typeof value.grantRevision !== "string") return false;
  if (typeof value.killSwitchEngaged !== "boolean") return false;
  if (value.requiresIdempotencyKey !== undefined && typeof value.requiresIdempotencyKey !== "boolean") return false;
  if (value.approvedTarget !== undefined && !isInvocationAuthorizationTarget(value.approvedTarget)) return false;
  if (value.approvalRef !== undefined && typeof value.approvalRef !== "string") return false;
  if (value.budget !== undefined) {
    if (!isPlainRecord(value.budget) || !hasOnlyKeys(value.budget, ["limit", "remaining"])) return false;
    const budget = value.budget as Record<string, unknown>;
    if (budget.limit !== undefined && typeof budget.limit !== "number") return false;
    if (budget.remaining !== undefined && typeof budget.remaining !== "number") return false;
  }
  if (value.detail !== undefined && !isPlainRecord(value.detail)) return false;
  return isInvocationAuthorityProfile(value.authorityProfile);
}
