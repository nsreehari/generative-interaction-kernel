import type { SampleServiceRegistryOptions } from "..";
import productionConfig from "../../config/host.production.json" with { type: "json" };
import { createEnvironmentCredentialResolver } from "./environment-credentials";
import { createSampleServiceRegistryOptions } from "./service-registry-options";

export function createHeadlessServiceRegistryOptions(
  environment: Readonly<Record<string, string | undefined>>,
): SampleServiceRegistryOptions {
  return createSampleServiceRegistryOptions({
    resolveCredential: createEnvironmentCredentialResolver(environment),
  }, {
    foundryProxyOrigin: environment.GIK_FOUNDRY_PROXY_ORIGIN?.trim()
      || productionConfig.foundryProxyOrigin,
    httpProxyOrigin: environment.GIK_HTTP_PROXY_ORIGIN?.trim()
      || productionConfig.httpProxyOrigin,
  });
}