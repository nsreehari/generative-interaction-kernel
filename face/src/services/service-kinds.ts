import Ajv, { type ValidateFunction } from "ajv";
import type {
  Json,
  NativeServiceDeclaration,
  ServiceScope,
} from "../../../kernel/src/index";
import type {
  ServiceAdapter,
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
    observe?: boolean;
  };
}

export interface ServiceKindContext {
  hostCapabilities: ReadonlySet<string>;
  /** The creating declaration's identity; shared adapters may serve other service IDs. */
  identity?: BlueprintServiceIdentity;
  resolveCredential?: (reference: string) => Promise<unknown>;
  clearCredential?: (reference: string) => void | Promise<void>;
  authorizeEndpoint?: (kind: string, endpoint: URL) => boolean | Promise<boolean>;
  execute?: (request: unknown) => Promise<unknown>;
  /** Read a host-owned readiness snapshot. Never acquire credentials or start interactive setup here. */
  inspectDependency?: (
    requirement: Readonly<ServiceDependencyRequirement>,
    identity: Readonly<BlueprintServiceIdentity>,
  ) => ServiceDependencyStatus;
}

export interface ServiceDependency {
  kind: string;
  ref?: string;
}

export interface ServiceDependencyRequirement extends ServiceDependency {
  id: string;
  title: string;
  description?: string;
  scheme?: string;
  permissions?: readonly string[];
}

/** Describes an action implemented by the host, not code or authority supplied by a Blueprint. */
export interface ServiceSetupAction {
  id: string;
  title: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  requiresUserInteraction?: boolean;
}

export type ServiceDependencyStatus =
  | { state: "ready"; actions?: readonly ServiceSetupAction[] }
  | {
    state: "missing" | "authorization-required" | "insufficient-permissions" | "unavailable";
    message: string;
    actions?: readonly ServiceSetupAction[];
  };

export interface ServiceDependencyDescription {
  requirement: ServiceDependencyRequirement;
  status: ServiceDependencyStatus;
}

export interface ServiceSetupReport {
  identity: BlueprintServiceIdentity;
  kind: string;
  validation: ServiceValidationReport;
  dependencies: ServiceDependencyDescription[];
  ready: boolean;
}

/** Signals that an active service invocation cannot proceed until its host supplies a dependency. */
export class UnsatisfiedServiceDependencyError extends Error {
  readonly code = "service-dependency-unsatisfied";
  readonly dependencyStatus?: ServiceDependencyStatus;

  constructor(
    message: string,
    readonly dependency: ServiceDependency,
    options?: ErrorOptions & { dependencyStatus?: ServiceDependencyStatus },
  ) {
    super(message, options);
    this.name = "UnsatisfiedServiceDependencyError";
    this.dependencyStatus = options?.dependencyStatus;
  }
}

function synchronousSetupResult<T>(value: T, message: string): T {
  if (value !== null && (typeof value === "object" || typeof value === "function")
    && "then" in value && typeof value.then === "function") {
    const error = new Error(message);
    // Preserve later rejection details on the reported contract error.
    void Promise.resolve(value).catch((cause: unknown) => { error.cause = cause; });
    throw error;
  }
  return value;
}

export function inspectServiceDependency(
  context: ServiceKindContext,
  requirement: ServiceDependencyRequirement,
  serviceId: string,
): ServiceDependencyStatus {
  if (!requirement.id.trim() || !requirement.title.trim() || !requirement.kind.trim()
    || (requirement.ref !== undefined && !requirement.ref.trim())
    || (requirement.scheme !== undefined && !requirement.scheme.trim())
    || requirement.permissions?.some((permission) => !permission.trim())) {
    throw new Error("Service dependency requirements must have nonempty identifiers and descriptions");
  }
  if (!context.identity || typeof serviceId !== "string" || !serviceId.trim()) {
    throw new Error("Service dependency inspection requires the current service identity");
  }
  const message = "Host dependency inspection must return a valid synchronous readiness snapshot";
  const status = synchronousSetupResult<ServiceDependencyStatus>(context.inspectDependency
    ? context.inspectDependency(structuredClone(requirement), { ...structuredClone(context.identity), serviceId })
    : { state: "unavailable", message: "The host has not configured dependency inspection for this service" }, message);
  if (!status || !["ready", "missing", "authorization-required", "insufficient-permissions", "unavailable"].includes(status.state)
    || (status.state !== "ready" && !status.message?.trim())) {
    throw new Error(message);
  }
  const actions = status.actions ?? [];
  if (new Set(actions.map(({ id }) => id)).size !== actions.length
    || actions.some(({ id, title }) => !id.trim() || !title.trim())) {
    throw new Error("Host setup actions must have unique nonempty identifiers and titles");
  }
  return structuredClone(status);
}

/** Recheck live readiness before using a cached connection, including each observation delivery. */
export function requireServiceDependency(
  context: ServiceKindContext,
  requirement: ServiceDependencyRequirement,
  serviceId: string,
): void {
  const status = inspectServiceDependency(context, requirement, serviceId);
  if (status.state !== "ready") {
    throw new UnsatisfiedServiceDependencyError(status.message, requirement, { dependencyStatus: status });
  }
}

export interface ServiceKindFactory {
  readonly manifest: ServiceKindManifest;
  /** Pure, non-secret requirements derived from validated service config and declared operations. */
  describeDependencies?(declaration: NativeServiceDeclaration): readonly ServiceDependencyRequirement[];
  /** Validate configuration without acquiring credentials, invoking services or starting setup. */
  validate?(
    declaration: NativeServiceDeclaration,
    context: ServiceKindContext
  ): ServiceValidationReport | Promise<ServiceValidationReport>;
  create(
    declaration: NativeServiceDeclaration,
    context: ServiceKindContext
  ): ServiceAdapter | Promise<ServiceAdapter>;
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

function normalizedDeclaration(declaration: NativeServiceDeclaration): string {
  return JSON.stringify({
    kind: declaration.kind,
    version: declaration.version,
    operations: Object.fromEntries(Object.entries(declaration.operations).sort(([left], [right]) => left.localeCompare(right))),
    config: declaration.config ?? null,
    scope: declaration.scope ?? "per-blueprint",
  });
}

function cacheKey(identity: BlueprintServiceIdentity, declaration: NativeServiceDeclaration): string | undefined {
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

  async validate(declaration: NativeServiceDeclaration): Promise<ServiceValidationReport> {
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
    if (Object.keys(declaration.operations).length === 0) return { ok: false, errors: ["At least one service operation is required"] };
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

  async describeSetup(
    identity: BlueprintServiceIdentity,
    declaration: NativeServiceDeclaration,
  ): Promise<ServiceSetupReport> {
    const validation = await this.validate(declaration);
    const dependencies = validation.ok ? this.dependencies(identity, declaration) : [];
    return structuredClone({
      identity, kind: declaration.kind, validation, dependencies,
      ready: validation.ok && dependencies.every(({ status }) => status.state === "ready"),
    });
  }

  private dependencies(
    identity: BlueprintServiceIdentity,
    declaration: NativeServiceDeclaration,
  ): ServiceDependencyDescription[] {
    const factory = this.factories.get(declaration.kind)!;
    const message = `Service kind '${declaration.kind}' must describe dependencies as a synchronous array`;
    const requirements = synchronousSetupResult(factory.describeDependencies
      ? factory.describeDependencies(structuredClone(declaration)) : [], message);
    if (!Array.isArray(requirements)) {
      throw new Error(message);
    }
    if (new Set(requirements.map(({ id }) => id)).size !== requirements.length) {
      throw new Error(`Service kind '${declaration.kind}' declares duplicate dependency identifiers`);
    }
    return requirements.map((requirement) => ({
      requirement: structuredClone(requirement),
      status: inspectServiceDependency({ ...this.context, identity }, requirement, identity.serviceId),
    }));
  }

  private requireDependencies(identity: BlueprintServiceIdentity, declaration: NativeServiceDeclaration): void {
    for (const { requirement, status } of this.dependencies(identity, declaration)) {
      if (status.state !== "ready") {
        throw new UnsatisfiedServiceDependencyError(status.message, requirement, { dependencyStatus: status });
      }
    }
  }

  async materialize(
    identity: BlueprintServiceIdentity,
    declaration: NativeServiceDeclaration
  ): Promise<ServiceAdapter> {
    const report = await this.validate(declaration);
    if (!report.ok) throw new Error(`Invalid service '${identity.serviceId}': ${(report.errors ?? []).join("; ")}`);
    this.requireDependencies(identity, declaration);
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
    declaration: NativeServiceDeclaration
  ): ServiceAdapter {
    const factory = this.factories.get(declaration.kind);
    if (!factory) throw new Error(`Unsupported service kind '${declaration.kind}'`);
    const description = this.describe().find(({ manifest }) => manifest.id === declaration.kind)!;
    if (!description.available) {
      throw new Error(`Service kind '${declaration.kind}' requires host capabilities: ${description.missingHostCapabilities.join(", ")}`);
    }
    if (!declaration.version.trim()) throw new Error("Service version is required");
    if (Object.keys(declaration.operations).length === 0) throw new Error("At least one service operation is required");
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
    this.requireDependencies(identity, declaration);
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

export function serviceConfig(declaration: NativeServiceDeclaration): Record<string, Json> {
  const config = declaration.config;
  if (config == null) return {};
  if (typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`Service kind '${declaration.kind}' config must be an object`);
  }
  return config as Record<string, Json>;
}
