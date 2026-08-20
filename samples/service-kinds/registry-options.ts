import type { Json } from "@gik/kernel";
import { UnsatisfiedServiceDependencyError } from "@gik/controlface/services";
import type { SampleServiceRegistryOptions } from ".";
import { executeCopilotAgentInvocation } from "./copilot-agent/runtime";
import { executeHttpServiceInvocation } from "./http-service/runtime";
import { executeMcpServiceInvocation } from "./mcp/runtime";

export interface SampleServiceHostCredentials {
  resolveCredential(reference: string): Promise<unknown>;
  clearCredential?(reference: string): void | Promise<void>;
}

export interface SampleServiceEndpointPolicy {
  foundryProxyOrigin: string;
  httpProxyOrigin: string;
}

export function createSampleServiceRegistryOptions(
  credentials: SampleServiceHostCredentials,
  endpoints: SampleServiceEndpointPolicy,
): SampleServiceRegistryOptions {
  const foundryOrigin = new URL(endpoints.foundryProxyOrigin).origin;
  const httpProxyOrigin = new URL(endpoints.httpProxyOrigin).origin;
  return {
    hostCapabilities: ["copilot-executor", "workspace-resolver", "foundry-executor", "credential-resolver", "http-executor", "mcp-executor"],
    resolveCredential: credentials.resolveCredential,
    clearCredential: credentials.clearCredential,
    authorizeEndpoint: (kind, endpoint) =>
      (kind === "foundry-agent" && endpoint.origin === foundryOrigin)
      || (kind === "http-service" && endpoint.origin === httpProxyOrigin),
    execute: async (request) => {
      const invocation = request as Parameters<typeof executeHttpServiceInvocation>[0];
      if (invocation.kind === "http-service") {
        const config = invocation.declaration.config as Record<string, Json> | undefined;
        const endpoint = String(config?.endpoint ?? "");
        const credentialRef = String(config?.credentialRef ?? "");
        if (new URL(endpoint).origin !== httpProxyOrigin) throw new Error(`HTTP proxy endpoint '${endpoint}' is not authorized by the host`);
        let accessKey: string;
        try {
          accessKey = String(await credentials.resolveCredential(credentialRef));
        } catch (error) {
          throw new UnsatisfiedServiceDependencyError(
            "HTTP proxy access is required",
            { kind: "credential", ref: credentialRef },
            { cause: error },
          );
        }
        try {
          return await executeHttpServiceInvocation(invocation, { proxyOrigin: endpoint, accessKey });
        } catch (error) {
          if (error && typeof error === "object" && "status" in error && (error.status === 401 || error.status === 403)) {
            await credentials.clearCredential?.(credentialRef);
          }
          throw error;
        }
      }
      if (invocation.kind === "mcp") {
        return executeMcpServiceInvocation(request as Parameters<typeof executeMcpServiceInvocation>[0]);
      }
      if (invocation.kind === "copilot-agent") {
        return executeCopilotAgentInvocation(request as Parameters<typeof executeCopilotAgentInvocation>[0]);
      }
      throw new Error(`Unsupported sample service execution kind '${String(invocation.kind ?? "unknown")}'`);
    },
  };
}