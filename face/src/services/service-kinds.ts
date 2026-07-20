import Ajv, { type ValidateFunction } from "ajv";
import type {
  DeclarativeServiceBinding,
  ExpressionProvider,
  Json,
  OrchestratorResult,
  ServiceDeclaration,
  ServiceOutputPolicy,
  ServiceScope,
  ServiceSubject,
  ServiceUse,
  StateModel,
} from "../../../kernel/src/index";
import type {
  QueueFace,
  ServiceAdapter,
  ServiceBinding,
  ServiceRequestInput,
  ServiceValidationReport,
} from "./queueface";

export type ServiceExecutionSubjectKind = "cell" | "substrate-agent" | "chat" | "task";

export interface ServiceKindManifest {
  id: string;
  version: string;
  title?: string;
  description?: string;
  configSchema: Record<string, unknown>;
  executionModes: readonly ("immediate" | "queued")[];
  subjects: readonly ServiceExecutionSubjectKind[];
  requiresHostCapabilities?: readonly string[];
  supports?: {
    discover?: boolean;
    probe?: boolean;
    simulate?: boolean;
    stream?: boolean;
    cancel?: boolean;
  };
}

export interface ServiceKindContext {
  hostCapabilities: ReadonlySet<string>;
  identity?: BlueprintServiceIdentity;
  resolveCredential?: (reference: string) => Promise<unknown>;
  authorizeEndpoint?: (kind: string, endpoint: URL) => boolean | Promise<boolean>;
  execute?: (request: unknown) => Promise<unknown>;
}

export interface ServiceKindFactory {
  readonly manifest: ServiceKindManifest;
  validate?(
    declaration: ServiceDeclaration,
    context: ServiceKindContext
  ): ServiceValidationReport | Promise<ServiceValidationReport>;
  create(
    declaration: ServiceDeclaration,
    context: ServiceKindContext
  ): ServiceAdapter | Promise<ServiceAdapter>;
  /** Kind-wide default guardrail/output policy for an operation, inherited by every Blueprint that
   * uses this kind unless it declares its own `operationPolicies` entry or a `ServiceUse.policyOverride`. */
  defaultOutputPolicy?(operation: string): ServiceOutputPolicy | undefined;
}

/** Merges resolved output policy from least to most specific: kind default, Blueprint-declared
 * per-operation policy, single-call-site override. A defined field on a more specific layer wins
 * outright over the same field on a less specific layer (no field-by-field guardrail merging). */
export function mergeOutputPolicy(
  ...layers: readonly (ServiceOutputPolicy | Partial<ServiceOutputPolicy> | undefined)[]
): ServiceOutputPolicy | undefined {
  let guardrails: ServiceOutputPolicy["guardrails"];
  let onViolation: ServiceOutputPolicy["onViolation"];
  let found = false;
  for (const layer of layers) {
    if (!layer) continue;
    if (layer.guardrails !== undefined) {
      guardrails = layer.guardrails;
      found = true;
    }
    if (layer.onViolation !== undefined) {
      onViolation = layer.onViolation;
      found = true;
    }
  }
  if (!found) return undefined;
  return { ...(guardrails !== undefined ? { guardrails } : {}), ...(onViolation !== undefined ? { onViolation } : {}) };
}

export interface ServiceKindDescription {
  manifest: ServiceKindManifest;
  available: boolean;
  missingHostCapabilities: string[];
}

export interface BlueprintServiceIdentity {
  blueprintId: string;
  blueprintRevision: string;
  serviceId: string;
}

function normalizedDeclaration(declaration: ServiceDeclaration): string {
  return JSON.stringify({
    kind: declaration.kind,
    version: declaration.version,
    operations: [...declaration.operations].sort(),
    config: declaration.config ?? null,
    scope: declaration.scope ?? "per-blueprint",
  });
}

function cacheKey(identity: BlueprintServiceIdentity, declaration: ServiceDeclaration): string | undefined {
  const scope: ServiceScope = declaration.scope ?? "per-blueprint";
  if (scope === "per-invocation") return undefined;
  const owner = scope === "per-blueprint"
    ? identity.blueprintId
    : `${identity.blueprintId}:${identity.serviceId}`;
  return `${scope}:${owner}:${identity.blueprintRevision}:${normalizedDeclaration(declaration)}`;
}

const FORBIDDEN_CREDENTIAL_FIELDS = new Set([
  "apikey",
  "credential",
  "functionkey",
  "password",
  "secret",
  "token",
]);

function literalCredentialPath(value: Json | undefined, path = "config"): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = literalCredentialPath(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return undefined;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/[-_]/g, "").toLowerCase();
    if (FORBIDDEN_CREDENTIAL_FIELDS.has(normalized)) return `${path}.${key}`;
    const found = literalCredentialPath(child, `${path}.${key}`);
    if (found) return found;
  }
  return undefined;
}

export class ServiceKindRegistry {
  private readonly factories = new Map<string, ServiceKindFactory>();
  private readonly validators = new Map<string, ValidateFunction>();
  private readonly adapters = new Map<string, ServiceAdapter | Promise<ServiceAdapter>>();
  private readonly context: ServiceKindContext;
  private readonly ajv = new Ajv({ allErrors: true, strict: false });

  constructor(context: Omit<ServiceKindContext, "hostCapabilities"> & {
    hostCapabilities?: Iterable<string>;
  } = {}) {
    this.context = {
      ...context,
      hostCapabilities: new Set(context.hostCapabilities ?? []),
    };
  }

  register(factory: ServiceKindFactory): void {
    const id = factory.manifest.id.trim();
    if (!id) throw new Error("Service kind id is required");
    if (this.factories.has(id)) throw new Error(`Service kind '${id}' is already registered`);
    this.validators.set(id, this.ajv.compile(factory.manifest.configSchema));
    this.factories.set(id, factory);
  }

  has(kind: string): boolean {
    return this.factories.has(kind);
  }

  /** The service kind's own default guardrail/output policy for an operation, if it declares one. */
  defaultOutputPolicy(kind: string, operation: string): ServiceOutputPolicy | undefined {
    return this.factories.get(kind)?.defaultOutputPolicy?.(operation);
  }

  describe(): ServiceKindDescription[] {
    return [...this.factories.values()].map(({ manifest }) => {
      const missingHostCapabilities = (manifest.requiresHostCapabilities ?? [])
        .filter((capability) => !this.context.hostCapabilities.has(capability));
      return {
        manifest: structuredClone(manifest),
        available: missingHostCapabilities.length === 0,
        missingHostCapabilities,
      };
    });
  }

  async validate(declaration: ServiceDeclaration): Promise<ServiceValidationReport> {
    const factory = this.factories.get(declaration.kind);
    if (!factory) return { ok: false, errors: [`Unsupported service kind '${declaration.kind}'`] };
    const description = this.describe().find(({ manifest }) => manifest.id === declaration.kind)!;
    if (!description.available) {
      return {
        ok: false,
        errors: [`Service kind '${declaration.kind}' requires host capabilities: ${description.missingHostCapabilities.join(", ")}`],
      };
    }
    if (!declaration.version.trim()) return { ok: false, errors: ["Service version is required"] };
    if (declaration.operations.length === 0) return { ok: false, errors: ["At least one service operation is required"] };
    if (new Set(declaration.operations).size !== declaration.operations.length) {
      return { ok: false, errors: ["Service operations must be unique"] };
    }
    const credentialPath = literalCredentialPath(declaration.config);
    if (credentialPath) {
      return { ok: false, errors: [`Literal credentials are forbidden at '${credentialPath}'; use credentialRef`] };
    }
    const validator = this.validators.get(declaration.kind)!;
    if (!validator(declaration.config ?? {})) {
      return {
        ok: false,
        errors: validator.errors?.map((error) => `config${error.instancePath || ""} ${error.message}`) ?? ["Invalid service config"],
      };
    }
    return factory.validate?.(declaration, this.context) ?? { ok: true };
  }

  async materialize(
    identity: BlueprintServiceIdentity,
    declaration: ServiceDeclaration
  ): Promise<ServiceAdapter> {
    const report = await this.validate(declaration);
    if (!report.ok) throw new Error(`Invalid service '${identity.serviceId}': ${(report.errors ?? []).join("; ")}`);
    const factory = this.factories.get(declaration.kind)!;
    const key = cacheKey(identity, declaration);
    const instanceContext = { ...this.context, identity };
    if (!key) return factory.create(declaration, instanceContext);
    let adapter = this.adapters.get(key);
    if (!adapter) {
      adapter = Promise.resolve(factory.create(declaration, instanceContext));
      this.adapters.set(key, adapter);
    }
    return adapter;
  }

  materializeSync(
    identity: BlueprintServiceIdentity,
    declaration: ServiceDeclaration
  ): ServiceAdapter {
    const factory = this.factories.get(declaration.kind);
    if (!factory) throw new Error(`Unsupported service kind '${declaration.kind}'`);
    const description = this.describe().find(({ manifest }) => manifest.id === declaration.kind)!;
    if (!description.available) {
      throw new Error(`Service kind '${declaration.kind}' requires host capabilities: ${description.missingHostCapabilities.join(", ")}`);
    }
    if (!declaration.version.trim()) throw new Error("Service version is required");
    if (declaration.operations.length === 0) throw new Error("At least one service operation is required");
    if (new Set(declaration.operations).size !== declaration.operations.length) {
      throw new Error("Service operations must be unique");
    }
    const credentialPath = literalCredentialPath(declaration.config);
    if (credentialPath) {
      throw new Error(`Literal credentials are forbidden at '${credentialPath}'; use credentialRef`);
    }
    const validator = this.validators.get(declaration.kind)!;
    if (!validator(declaration.config ?? {})) {
      throw new Error(`Invalid service '${identity.serviceId}': ${validator.errors?.map((error) => `config${error.instancePath || ""} ${error.message}`).join("; ")}`);
    }
    const validation = factory.validate?.(declaration, this.context) ?? { ok: true };
    if (validation instanceof Promise) {
      throw new Error(`Service kind '${declaration.kind}' requires asynchronous validation`);
    }
    if (!validation.ok) {
      throw new Error(`Invalid service '${identity.serviceId}': ${(validation.errors ?? []).join("; ")}`);
    }
    const key = cacheKey(identity, declaration);
    const existing = key ? this.adapters.get(key) : undefined;
    if (existing) {
      if (existing instanceof Promise) throw new Error(`Service '${identity.serviceId}' is materializing asynchronously`);
      return existing;
    }
    const created = factory.create(declaration, { ...this.context, identity });
    if (created instanceof Promise) {
      throw new Error(`Service kind '${declaration.kind}' requires asynchronous materialization`);
    }
    if (key) this.adapters.set(key, created);
    return created;
  }
}

export interface BindServiceUseOptions {
  blueprintId: string;
  blueprintRevision: string;
  inlineServiceId?: string;
  invoke: string;
  mode?: ServiceBinding["mode"];
  mapRequest?: ServiceBinding["mapRequest"];
  mapResult?: ServiceBinding["mapResult"];
  subject?: ServiceSubject;
}

export interface BindDeclarativeServiceUsesOptions {
  blueprintId: string;
  blueprintRevision: string;
  state: StateModel;
  expression: ExpressionProvider;
}

async function evaluated(expression: ExpressionProvider, source: string, data: Record<string, unknown>): Promise<Json> {
  const value = await expression.eval(source, data);
  return JSON.parse(JSON.stringify(value)) as Json;
}

function record(value: Json, label: string): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Declarative service ${label} expression must return an object`);
  }
  return value as Record<string, Json>;
}

function requestMapping(value: Json): Pick<ServiceRequestInput, "input" | "eventPayload" | "actorId"> {
  const mapped = record(value, "request");
  const unknown = Object.keys(mapped).filter((key) => !["input", "eventPayload", "actorId"].includes(key));
  if (unknown.length > 0) throw new Error(`Declarative service request has unknown field '${unknown[0]}'`);
  if (mapped.actorId !== undefined && typeof mapped.actorId !== "string") {
    throw new Error("Declarative service request actorId must be a string");
  }
  if (mapped.eventPayload !== undefined
    && (!mapped.eventPayload || typeof mapped.eventPayload !== "object" || Array.isArray(mapped.eventPayload))) {
    throw new Error("Declarative service request eventPayload must be an object");
  }
  return {
    input: mapped.input,
    eventPayload: mapped.eventPayload as Record<string, Json> | undefined,
    actorId: mapped.actorId as string | undefined,
  };
}

function isPatchOp(value: Json): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, Json>;
  return ["set", "merge", "remove"].includes(String(candidate.op))
    && typeof candidate.path === "string";
}

function orchestratorResult(value: Json): OrchestratorResult {
  const mapped = record(value, "result");
  const unknown = Object.keys(mapped).filter((key) => !["ops", "events", "outcome", "detail"].includes(key));
  if (unknown.length > 0) throw new Error(`Declarative service result has unknown field '${unknown[0]}'`);
  if (mapped.ops !== undefined && (!Array.isArray(mapped.ops) || !mapped.ops.every(isPatchOp))) {
    throw new Error("Declarative service result ops must be valid patch operations");
  }
  if (mapped.outcome !== undefined && typeof mapped.outcome !== "string") {
    throw new Error("Declarative service result outcome must be a string");
  }
  if (mapped.events !== undefined && (!Array.isArray(mapped.events) || !mapped.events.every((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const event = value as Record<string, Json>;
    return typeof event.node === "string" && typeof event.name === "string"
      && (event.actorId === undefined || typeof event.actorId === "string")
      && (event.payload === undefined
        || (!!event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)));
  }))) {
    throw new Error("Declarative service result events must be valid GIK events");
  }
  if (mapped.detail !== undefined
    && (!mapped.detail || typeof mapped.detail !== "object" || Array.isArray(mapped.detail))) {
    throw new Error("Declarative service result detail must be an object");
  }
  return mapped as unknown as OrchestratorResult;
}

/** Materialize all Blueprint-authored service mappings through one trusted evaluator boundary. */
export function bindDeclarativeServiceUsesSync(
  queueFace: QueueFace,
  registry: ServiceKindRegistry,
  declarations: Record<string, ServiceDeclaration>,
  bindings: readonly DeclarativeServiceBinding[],
  options: BindDeclarativeServiceUsesOptions
): void {
  for (const binding of bindings) {
    const { serviceId } = resolveServiceUse(binding.use, declarations);
    bindServiceUseSync(queueFace, registry, declarations, binding.use, {
      blueprintId: options.blueprintId,
      blueprintRevision: options.blueprintRevision,
      invoke: binding.invoke,
      mode: binding.mode,
      subject: binding.subject,
      mapRequest: binding.request
        ? async (effect) => ({
            service: serviceId,
            operation: binding.use.operation,
            ...requestMapping(await evaluated(options.expression, binding.request!, {
              state: options.state.snapshot(),
              effect,
            })),
          })
        : undefined,
      mapResult: binding.result
        ? async (result, effect) => orchestratorResult(await evaluated(options.expression, binding.result!, {
            state: options.state.snapshot(),
            effect,
            result,
          }))
        : undefined,
    });
  }
}

export function resolveServiceUse(
  use: ServiceUse,
  declarations: Record<string, ServiceDeclaration>,
  inlineServiceId?: string
): { serviceId: string; declaration: ServiceDeclaration } {
  const serviceId = use.service ?? inlineServiceId;
  if (!serviceId) throw new Error("Inline service use requires an inline service id");
  const declaration = use.inline ?? declarations[serviceId];
  if (!declaration) throw new Error(`Unknown Blueprint service '${serviceId}'`);
  if (!declaration.operations.includes(use.operation)) {
    throw new Error(`Service '${serviceId}' does not declare operation '${use.operation}'`);
  }
  return { serviceId, declaration };
}

export async function bindServiceUse(
  queueFace: QueueFace,
  registry: ServiceKindRegistry,
  declarations: Record<string, ServiceDeclaration>,
  use: ServiceUse,
  options: BindServiceUseOptions
): Promise<ServiceBinding> {
  const resolved = resolveServiceUse(use, declarations, options.inlineServiceId);
  const adapter = await registry.materialize({
    blueprintId: options.blueprintId,
    blueprintRevision: options.blueprintRevision,
    serviceId: resolved.serviceId,
  }, resolved.declaration);
  if (!queueFace.hasProvider(adapter.provider.id)) queueFace.registerAdapter(adapter);
  const binding: ServiceBinding = {
    service: resolved.serviceId,
    version: resolved.declaration.version,
    operation: use.operation,
    providerId: adapter.provider.id,
    capabilityId: use.contract,
    invoke: options.invoke,
    mode: options.mode,
    blueprintId: options.blueprintId,
    blueprintRevision: options.blueprintRevision,
    serviceRef: resolved.serviceId,
    subject: options.subject,
    mapRequest: options.mapRequest,
    mapResult: options.mapResult,
    outputPolicy: mergeOutputPolicy(
      registry.defaultOutputPolicy(resolved.declaration.kind, use.operation),
      resolved.declaration.operationPolicies?.[use.operation],
      use.policyOverride
    ),
  };
  queueFace.bind(binding);
  return binding;
}

export function bindServiceUseSync(
  queueFace: QueueFace,
  registry: ServiceKindRegistry,
  declarations: Record<string, ServiceDeclaration>,
  use: ServiceUse,
  options: BindServiceUseOptions
): ServiceBinding {
  const resolved = resolveServiceUse(use, declarations, options.inlineServiceId);
  const adapter = registry.materializeSync({
    blueprintId: options.blueprintId,
    blueprintRevision: options.blueprintRevision,
    serviceId: resolved.serviceId,
  }, resolved.declaration);
  if (!queueFace.hasProvider(adapter.provider.id)) queueFace.registerAdapter(adapter);
  const binding: ServiceBinding = {
    service: resolved.serviceId,
    version: resolved.declaration.version,
    operation: use.operation,
    providerId: adapter.provider.id,
    capabilityId: use.contract,
    invoke: options.invoke,
    mode: options.mode,
    blueprintId: options.blueprintId,
    blueprintRevision: options.blueprintRevision,
    serviceRef: resolved.serviceId,
    subject: options.subject,
    mapRequest: options.mapRequest,
    mapResult: options.mapResult,
    outputPolicy: mergeOutputPolicy(
      registry.defaultOutputPolicy(resolved.declaration.kind, use.operation),
      resolved.declaration.operationPolicies?.[use.operation],
      use.policyOverride
    ),
  };
  queueFace.bind(binding);
  return binding;
}

export function serviceConfig(declaration: ServiceDeclaration): Record<string, Json> {
  const config = declaration.config;
  if (config == null) return {};
  if (typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`Service kind '${declaration.kind}' config must be an object`);
  }
  return config as Record<string, Json>;
}
