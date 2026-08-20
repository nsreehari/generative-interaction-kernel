import {
  materializeBlueprint,
  parseBlueprintReference,
  type BlueprintArtifact,
  type BlueprintHostRegistry,
  type HostedBlueprintResolutionContext,
} from "@gik/blueprint";
import {
  ControlFace,
  openBlueprint,
  type BlueprintRuntime,
} from "@gik/controlface/blueprint";
import {
  DefaultServiceHost,
  type BlueprintServiceIdentity,
  type BlueprintServiceResolver,
  type ServiceAdapter,
  type ServiceKindRegistry,
} from "@gik/controlface/services";
import {
  InMemoryStateModel,
  JsonataExpressionProvider,
  type BlueprintServiceDeclaration,
  type GIKEvent,
  type Json,
  type ServiceDeclaration,
} from "@gik/kernel";

export interface BlueprintServiceResolverOptions {
  registry: BlueprintHostRegistry;
  instanceId: string;
  createServiceRegistry(context: BlueprintServiceRegistryContext): ServiceKindRegistry;
}

export interface BlueprintServiceRegistryContext {
  blueprintId: string;
  blueprintRevision: string;
  instanceId: string;
  owner: BlueprintServiceIdentity;
}

export function createBlueprintServiceResolver(
  options: BlueprintServiceResolverOptions,
): BlueprintServiceResolver {
  const adapters = new Map<string, Promise<ServiceAdapter>>();
  const resolver: BlueprintServiceResolver = {
    async validate(identity, declaration) {
      try {
        const artifact = await resolveArtifact(options.registry, identity, declaration);
        validatePublicContract(artifact, declaration);
        return { ok: true };
      } catch (error) {
        return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
      }
    },
    materialize(identity, declaration) {
      if (declaration.scope === "per-invocation") {
        return createAdapter(options, resolver, identity, declaration);
      }
      const key = JSON.stringify({ identity, ref: declaration.blueprint.$ref, scope: declaration.scope ?? "per-blueprint" });
      let adapter = adapters.get(key);
      if (!adapter) {
        adapter = createAdapter(options, resolver, identity, declaration);
        adapters.set(key, adapter);
      }
      return adapter;
    },
  };
  return resolver;
}

async function createAdapter(
  options: BlueprintServiceResolverOptions,
  resolver: BlueprintServiceResolver,
  identity: { blueprintId: string; blueprintRevision: string; serviceId: string },
  declaration: BlueprintServiceDeclaration,
): Promise<ServiceAdapter> {
  const source = await resolveArtifact(options.registry, identity, declaration);
  validatePublicContract(source, declaration);
  const context = resolutionContext(identity);
  const materialized = materializeBlueprint({
    blueprint: source,
    resolveBlueprint(reference) {
      return options.registry.resolveArtifact(parseBlueprintReference(reference), context);
    },
  });
  const runtime = openBlueprint(materialized.payload.terminalBlueprint);
  const state = createState(runtime);
  const services = runtime.definition.payload.services as Record<string, ServiceDeclaration> | undefined;
  const serviceHost = new DefaultServiceHost({
    blueprintId: runtime.blueprintId,
    blueprintRevision: runtime.revision,
    declarations: services ?? {},
    registry: options.createServiceRegistry({
      blueprintId: runtime.blueprintId,
      blueprintRevision: runtime.revision,
      instanceId: serviceBlueprintInstanceId(options.instanceId, identity, runtime),
      owner: identity,
    }),
    blueprintServices: resolver,
    state,
    expression: new JsonataExpressionProvider({ safe: true }),
    dependencyFailurePolicy: "throw",
  });
  const serviceOperations = new Set(Object.values(services ?? {}).flatMap((service) => Object.keys(service.operations)));
  const controlface = new ControlFace(runtime.vocabulary, runtime.program, {
    state,
    serviceHost,
    blueprint: runtime.definition,
    orchestrator: {
      invoke: (effect) => effect.kind === "invoke" && serviceOperations.has(effect.control.tool)
        ? serviceHost.invoke(effect)
        : Promise.reject(new Error(`Blueprint service '${runtime.blueprintId}' cannot handle '${effect.kind}'`)),
    },
  });
  const handlers = publicEventHandlers(source);
  const output = serviceOutput(source);
  const operations = new Set(Object.values(declaration.operations).map(({ operation }) => operation));
  return {
    provider: { id: declaration.blueprint.$ref, version: source.payload.version },
    discover: async () => ({
      provider: { id: declaration.blueprint.$ref, version: source.payload.version },
      revision: source.payload.version,
      discoveredAt: new Date().toISOString(),
      capabilities: [...operations].map((operation) => ({
        id: operation,
        operation,
        version: declaration.version,
        inputSchema: {},
        assurance: "declared-and-locally-validated",
      })),
    }),
    validate: async (request) => operations.has(request.operation)
      ? { ok: true }
      : { ok: false, errors: [`Operation '${request.operation}' is not declared`] },
    execute: async (request) => {
      const node = handlers.get(request.operation);
      if (!node) throw new Error(`Blueprint '${source.payload.id}' does not expose event '${request.operation}'`);
      await controlface.emit({
        node,
        name: request.operation,
        payload: eventPayload(request.input),
        actorId: request.actorId,
      } satisfies GIKEvent);
      await controlface.whenIdle();
      return { output: readPath(controlface.getState(), output.from) };
    },
  };
}

function serviceBlueprintInstanceId(
  rootInstanceId: string,
  owner: BlueprintServiceIdentity,
  runtime: BlueprintRuntime,
): string {
  return [
    rootInstanceId,
    `${owner.blueprintId}@${owner.blueprintRevision}`,
    `${runtime.blueprintId}@${runtime.revision}`,
  ].join("/services/");
}

async function resolveArtifact(
  registry: BlueprintHostRegistry,
  identity: { blueprintId: string; blueprintRevision: string; serviceId: string },
  declaration: BlueprintServiceDeclaration,
): Promise<BlueprintArtifact> {
  const reference = parseBlueprintReference(declaration.blueprint.$ref);
  const resolved = await registry.resolve(reference, resolutionContext(identity));
  if (resolved.reference.id !== reference.id
    || (reference.version !== undefined && resolved.reference.version !== reference.version)) {
    throw new Error(`Blueprint host registry returned a mismatched definition for '${declaration.blueprint.$ref}'`);
  }
  return resolved.blueprint;
}

function resolutionContext(identity: {
  blueprintId: string;
  blueprintRevision: string;
  serviceId: string;
}): HostedBlueprintResolutionContext {
  return {
    parentBlueprintId: identity.blueprintId,
    parentInstanceId: `${identity.blueprintId}@${identity.blueprintRevision}`,
    cellId: `services/${identity.serviceId}`,
  };
}

function validatePublicContract(
  blueprint: BlueprintArtifact,
  declaration: BlueprintServiceDeclaration,
): void {
  const exposed = new Set(blueprint.payload.interface?.events ?? []);
  const handlers = publicEventHandlers(blueprint);
  for (const { operation } of Object.values(declaration.operations)) {
    if (!exposed.has(operation)) {
      throw new Error(`Blueprint '${blueprint.payload.id}' does not declare interface event '${operation}'`);
    }
    if (!handlers.has(operation)) {
      throw new Error(`Blueprint '${blueprint.payload.id}' does not uniquely handle interface event '${operation}'`);
    }
  }
  serviceOutput(blueprint);
}

function publicEventHandlers(blueprint: BlueprintArtifact): Map<string, string> {
  const exposed = new Set(blueprint.payload.interface?.events ?? []);
  const candidates = new Map<string, string[]>();
  for (const [cellId, cell] of Object.entries(blueprint.payload.cells ?? {})) {
    for (const event of Object.keys(cell.behavior?.on ?? {})) {
      if (!exposed.has(event)) continue;
      candidates.set(event, [...(candidates.get(event) ?? []), cellId]);
    }
  }
  return new Map([...candidates].flatMap(([event, cells]) => cells.length === 1 ? [[event, cells[0]]] : []));
}

function serviceOutput(blueprint: BlueprintArtifact): { name: string; from: string } {
  const outputs = Object.entries(blueprint.payload.interface?.outputs ?? {})
    .filter((entry): entry is [string, { from: string }] => typeof entry[1].from === "string" && Boolean(entry[1].from));
  if (outputs.length !== 1) {
    throw new Error(`Blueprint service '${blueprint.payload.id}' must declare exactly one output with a 'from' path`);
  }
  return { name: outputs[0][0], from: outputs[0][1].from };
}

function createState(runtime: BlueprintRuntime): InMemoryStateModel {
  const state = new InMemoryStateModel(Object.keys(runtime.state));
  state.apply(Object.entries(runtime.state).map(([path, value]) => ({ op: "set" as const, path, value })));
  return state;
}

function eventPayload(input: Json | undefined): Record<string, Json> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, Json>
    : { value: input ?? null };
}

function readPath(state: Record<string, Json>, path: string): Json {
  let current: Json = state;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !(segment in current)) return null;
    current = (current as Record<string, Json>)[segment];
  }
  return structuredClone(current);
}