import Ajv, { type ValidateFunction } from "ajv";
import type { Json, ServiceDeclaration, ServiceScope, ServiceSubject, ServiceUse } from "../../../kernel/src/index";
import type {
  QueueFace,
  ServiceAdapter,
  ServiceBinding,
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
