import { DefaultServiceHost, type ServiceHost } from "@gik/controlface";
import type { BlueprintRuntime } from "@gik/controlface/blueprint";
import { unwrap, type ServiceDeclaration, type StateModel } from "@gik/kernel";
import { JsonataExpressionProvider } from "@gik/kernel";
import type { LoadBundleOptions } from "@gik/react";
import {
  createSampleServiceKindRegistry,
  type SampleServiceRegistryOptions,
} from "../../service-kinds";
import productionConfig from "../../config/host.production.json" with { type: "json" };
import { createEnvironmentCredentialResolver } from "./environment-credentials";
import type { HostConfig } from "../../config/host-config";
import { createSampleServiceRegistryOptions } from "../../service-kinds/registry-options";

export function createNodeHostConfig(
  environment: Readonly<Record<string, string | undefined>>,
): HostConfig {
  return {
    foundryProxyOrigin: environment.GIK_FOUNDRY_PROXY_ORIGIN?.trim()
      || productionConfig.foundryProxyOrigin,
    httpProxyOrigin: environment.GIK_HTTP_PROXY_ORIGIN?.trim()
      || productionConfig.httpProxyOrigin,
  };
}

export function createNodeServiceRegistryOptions(
  environment: Readonly<Record<string, string | undefined>>,
  overrides: Pick<SampleServiceRegistryOptions, "deterministicHandlers"> = {},
): SampleServiceRegistryOptions {
  return {
    ...createSampleServiceRegistryOptions({
      resolveCredential: createEnvironmentCredentialResolver(environment),
    }, createNodeHostConfig(environment)),
    ...overrides,
  };
}

export function createNodeBlueprintServiceHost(
  runtime: BlueprintRuntime,
  state: StateModel,
  environment: Readonly<Record<string, string | undefined>>,
  overrides: Pick<SampleServiceRegistryOptions, "deterministicHandlers"> = {},
): ServiceHost {
  const manifest = unwrap(runtime.vocabulary);
  const declarations = (manifest.externals?.services ?? {}) as Record<string, ServiceDeclaration>;
  return new DefaultServiceHost({
    blueprintId: runtime.blueprintId,
    blueprintRevision: runtime.revision,
    declarations,
    registry: createSampleServiceKindRegistry(createNodeServiceRegistryOptions(environment, overrides)),
    state,
    expression: new JsonataExpressionProvider({ safe: true }),
    dependencyFailurePolicy: "throw",
  });
}

export function nodeServiceOrchestrator(
  runtime: BlueprintRuntime,
  host: ServiceHost,
): NonNullable<LoadBundleOptions["wrapOrchestrator"]> {
  const declarations = (unwrap(runtime.vocabulary).externals?.services ?? {}) as Record<string, ServiceDeclaration>;
  const serviceInvokes = new Set(Object.values(declarations).flatMap((declaration) => Object.keys(declaration.operations)));
  return (fallback) => ({
    invoke: (effect, control) => effect.kind === "invoke" && typeof effect.tool === "string" && serviceInvokes.has(effect.tool)
      ? host.invoke(effect)
      : fallback?.invoke?.(effect, control) ?? Promise.resolve(),
    confirm: fallback?.confirm?.bind(fallback),
    route: fallback?.route?.bind(fallback),
    compensate: fallback?.compensate?.bind(fallback),
  });
}