import type { Json, NativeServiceDeclaration } from "@gik/kernel";
import {
  serviceConfig,
  type ServiceAdapter,
  type ServiceKindFactory,
  type ServiceKindManifest,
} from "@gik/controlface/services";

import manifestJson from "./manifest.json";

export type DeterministicServiceHandler = (
  operation: string,
  input: Json,
  context: Record<string, Json> | undefined
) => Json | Promise<Json>;

export function createDeterministicAgentKind(
  handlers: Record<string, DeterministicServiceHandler>
): ServiceKindFactory {
  const manifest = manifestJson as ServiceKindManifest;
  return {
    manifest,
    validate: (declaration) => {
      const handler = serviceConfig(declaration).handler;
      if (typeof handler !== "string" || !handler.trim()) {
        return { ok: false, errors: ["deterministic-agent requires config.handler"] };
      }
      return handlers[handler]
        ? { ok: true }
        : { ok: false, errors: [`Unknown deterministic handler '${handler}'`] };
    },
    create: (declaration: NativeServiceDeclaration): ServiceAdapter => {
      const handlerId = String(serviceConfig(declaration).handler);
      const handler = handlers[handlerId];
      const operations = [...new Set(Object.values(declaration.operations).map(({ operation }) => operation))];
      return {
        provider: { id: `deterministic-agent:${handlerId}`, version: manifest.version },
        discover: async () => ({
          provider: { id: `deterministic-agent:${handlerId}`, version: manifest.version },
          revision: manifest.version,
          discoveredAt: new Date().toISOString(),
          capabilities: operations.map((operation) => ({
            id: operation,
            operation,
            name: operation,
            version: declaration.version,
            inputSchema: {},
            assurance: "declared-and-locally-validated",
          })),
        }),
        validate: async (request) => operations.includes(request.operation)
          ? { ok: true }
          : { ok: false, errors: [`Operation '${request.operation}' is not declared`] },
        execute: async (request) => ({
          output: await handler(request.operation, request.input ?? null, request.eventPayload),
        }),
      };
    },
  };
}
