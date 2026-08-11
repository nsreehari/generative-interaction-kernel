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
  };
}

export interface ServiceKindContext {
  hostCapabilities: ReadonlySet<string>;
  identity?: BlueprintServiceIdentity;
  resolveCredential?: (reference: string) => Promise<unknown>;
  clearCredential?: (reference: string) => void | Promise<void>;
  authorizeEndpoint?: (kind: string, endpoint: URL) => boolean | Promise<boolean>;
  execute?: (request: unknown) => Promise<unknown>;
}

export interface ServiceDependency {
  kind: string;
  ref?: string;
}

/** Signals that an active service invocation cannot proceed until its host supplies a dependency. */
export class UnsatisfiedServiceDependencyError extends Error {
  readonly code = "service-dependency-unsatisfied";

  constructor(
    message: string,
    readonly dependency: ServiceDependency,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "UnsatisfiedServiceDependencyError";
  }
}

export interface ServiceKindFactory {
  readonly manifest: ServiceKindManifest;
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

  async materialize(
    identity: BlueprintServiceIdentity,
    declaration: NativeServiceDeclaration
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
