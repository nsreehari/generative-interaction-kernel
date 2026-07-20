import type { Json, ServiceDeclaration } from "../../kernel/src/index";
import type {
  ServiceKindFactory,
  ServiceKindManifest,
} from "../../face/src/services/service-kinds";
import type { ServiceAdapter } from "../../face/src/services/queueface";

export interface WorkerServiceInvocation {
  kind: string;
  declaration: ServiceDeclaration;
  operation: string;
  input: Json;
  eventPayload?: Record<string, Json>;
  actorId?: string;
  correlationId?: string;
  idempotencyKey?: string;
}

export function createWorkerServiceKind(manifest: ServiceKindManifest): ServiceKindFactory {
  return {
    manifest,
    validate: (_declaration, context) => context.execute
      ? { ok: true }
      : { ok: false, errors: [`Service kind '${manifest.id}' requires a host executor`] },
    create: (declaration, context): ServiceAdapter => ({
      provider: {
        id: `${manifest.id}:${context.identity?.serviceId ?? "anonymous"}`,
        version: manifest.version,
        title: manifest.title,
      },
      discover: async () => ({
        provider: {
          id: `${manifest.id}:${context.identity?.serviceId ?? "anonymous"}`,
          version: manifest.version,
          title: manifest.title,
        },
        revision: manifest.version,
        discoveredAt: new Date().toISOString(),
        capabilities: declaration.operations.map((operation) => ({
          id: operation,
          operation,
          version: declaration.version,
          inputSchema: {},
          assurance: "declared-and-locally-validated",
          supports: {
            cancel: manifest.supports?.cancel,
            simulate: manifest.supports?.simulate,
            validate: true,
          },
        })),
      }),
      validate: async (request) => declaration.operations.includes(request.operation)
        ? { ok: true }
        : { ok: false, errors: [`Operation '${request.operation}' is not declared`] },
      execute: async (request) => ({
        output: await context.execute!({
          kind: manifest.id,
          declaration,
          operation: request.operation,
          input: request.input ?? null,
          eventPayload: request.eventPayload,
          actorId: request.actorId,
          correlationId: request.correlationId,
          idempotencyKey: request.idempotencyKey,
        }) as Json,
      }),
    }),
  };
}
