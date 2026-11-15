import { validateJsonValue, InMemoryStateModel, JsonataExpressionProvider, type Json } from "../../../kernel/src/index";
import { DefaultServiceHost, type DefaultServiceHostOptions } from "./service-host";
import { serviceConfig } from "./service-kinds";
import type { ServiceDependencyDescription, ServiceKindManifest, ServiceSetupReport } from "./service-kinds";
import { configuredServiceDeclarations, type ServiceConfigurations } from "./settings";

export interface ServiceSetupDescription {
  id: string;
  config: Record<string, Json>;
  provider: ServiceKindManifest;
  setup: ServiceSetupReport;
}
export type ServiceSetupActionHandler = (request: {
  service: ServiceSetupDescription; dependency: ServiceDependencyDescription;
  actionId: string; input: Json; signal: AbortSignal;
}) => Promise<void>;

export function createServiceSetupController(options: Pick<DefaultServiceHostOptions, "blueprintId" | "blueprintRevision" | "declarations" | "registry"> & {
  configurations?: ServiceConfigurations;
  actions?: Readonly<Record<string, ServiceSetupActionHandler>>;
}) {
  const declarations = configuredServiceDeclarations(options.declarations, options.configurations);
  const host = new DefaultServiceHost({ ...options, declarations,
    state: new InMemoryStateModel(), expression: new JsonataExpressionProvider({ safe: true }),
    maxAttempts: 1, maxGuardrailAttempts: 1 });
  async function describe(): Promise<ServiceSetupDescription[]> {
    const kinds = new Map(options.registry.describe().map(kind => [kind.manifest.id, kind.manifest]));
    return Promise.all(Object.entries(declarations).map(async ([id, declaration]) => {
      if (!("kind" in declaration) || typeof declaration.kind !== "string")
        throw new Error("Inspect a nested Blueprint service through its owning host.");
      const provider = kinds.get(declaration.kind);
      if (!provider) throw new Error(`The service kind is not registered: ${declaration.kind}`);
      return { id, config: serviceConfig(declaration), provider, setup: await host.describeServiceSetup(id) };
    }));
  }
  return {
    describe,
    async validate() {
      const reports = await describe();
      const invalid = reports.find(report => !report.setup.validation.ok);
      if (invalid) throw new Error(invalid.setup.validation.errors?.join("; ") || "Service configuration is invalid.");
    },
    async action(serviceId: string, dependencyId: string, actionId: string, input: Json, signal: AbortSignal) {
      signal.throwIfAborted();
      const report = (await describe()).find(report => report.id === serviceId);
      const dependency = report?.setup.dependencies.find(item => item.requirement.id === dependencyId);
      const action = dependency?.status.actions?.find(action => action.id === actionId);
      const handler = options.actions && Object.hasOwn(options.actions, actionId) ? options.actions[actionId] : undefined;
      if (!report?.setup.validation.ok || !dependency || !action || !handler)
        throw new Error("This setup action is not currently registered and available.");
      validateJsonValue(action.inputSchema ?? { type: "object", additionalProperties: false }, input, "Invalid setup action input");
      signal.throwIfAborted();
      await handler({ service: report, dependency, actionId, input, signal });
      signal.throwIfAborted();
    },
  };
}
