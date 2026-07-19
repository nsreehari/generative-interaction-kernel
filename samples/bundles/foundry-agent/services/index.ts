import type { Json, ServiceDeclaration, StateModel } from "@gik/kernel";
import type { LoadBundleOptions } from "@gik/react";
import {
  bindServiceUseSync,
  QueueFace,
  type ServiceExecutionResult,
} from "@gik/controlface";
import { createSampleServiceKindRegistry } from "../../../services";
import { getFoundryAccessKey } from "../access-storage";
import manifest from "../manifest.json" with { type: "json" };

const SERVICE_ID = "assistant";
const CREDENTIAL_REF = "foundry-agent/access-key";

function stringAt(state: StateModel, path: string): string {
  const value = state.get(path);
  return typeof value === "string" ? value : "";
}

function settleChat(result: ServiceExecutionResult, message: string) {
  const output = result.output;
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new Error("Foundry agent returned an invalid chat response");
  }
  const response = output as Record<string, Json>;
  if (typeof response.conversationId !== "string"
    || typeof response.responseId !== "string"
    || typeof response.reply !== "string") {
    throw new Error("Foundry agent returned an invalid chat response");
  }
  return {
    ops: [
      { op: "set" as const, path: "agent.error", value: "" },
      { op: "set" as const, path: "agent.lastAsked", value: message },
      { op: "set" as const, path: "agent.draft", value: "" },
      { op: "set" as const, path: "agent.conversationId", value: response.conversationId },
      { op: "set" as const, path: "agent.reply", value: response.reply },
    ],
    detail: {
      provider: "foundry-agent",
      responseId: response.responseId,
      conversationId: response.conversationId,
    },
  };
}

const declarations = manifest.payload.externals.services as Record<string, ServiceDeclaration>;

export function createFoundryAgentQueueFace(state: StateModel): QueueFace {
  const registry = createSampleServiceKindRegistry({
    hostCapabilities: ["foundry-executor", "credential-resolver"],
    resolveCredential: async (reference) => {
      if (reference !== CREDENTIAL_REF) throw new Error(`Unknown credential reference '${reference}'`);
      const key = getFoundryAccessKey().trim();
      if (!key) throw new Error("Foundry access is required");
      return key;
    },
    authorizeEndpoint: (kind, endpoint) =>
      kind === "foundry-agent" && endpoint.origin === "https://sz-foundry-proxy.azurewebsites.net",
  });
  const queueFace = new QueueFace();
  bindServiceUseSync(queueFace, registry, declarations, {
    service: SERVICE_ID,
    operation: "chat",
    contract: "foundry-chat/v1",
  }, {
    blueprintId: "foundry-agent",
    blueprintRevision: manifest.payload.version,
    invoke: "askAgent",
    subject: { kind: "chat", blueprintId: "foundry-agent", turnId: "current" },
    mapRequest: (effect) => ({
      service: SERVICE_ID,
      operation: "chat",
      input: {
        message: stringAt(state, "agent.draft").trim(),
        agentName: stringAt(state, "agent.agentName").trim(),
        conversationId: stringAt(state, "agent.conversationId") || null,
      },
      actorId: effect.actorId,
    }),
    mapResult: (result) => settleChat(result, stringAt(state, "agent.draft").trim()),
  });
  return queueFace;
}

export async function discoverFoundryAgents(endpoint: string, key: string): Promise<string[]> {
  const registry = createSampleServiceKindRegistry({
    hostCapabilities: ["foundry-executor", "credential-resolver"],
    resolveCredential: async (reference) => {
      if (reference !== CREDENTIAL_REF) throw new Error(`Unknown credential reference '${reference}'`);
      return key;
    },
    authorizeEndpoint: (kind, value) =>
      kind === "foundry-agent" && value.origin === "https://sz-foundry-proxy.azurewebsites.net",
  });
  const queueFace = new QueueFace();
  bindServiceUseSync(queueFace, registry, {}, {
    inline: {
      kind: "foundry-agent",
      version: "1",
      operations: ["discover"],
      config: { endpoint, credentialRef: CREDENTIAL_REF },
      scope: "per-invocation",
    },
    operation: "discover",
    contract: "foundry-agent-discovery/v1",
  }, {
    blueprintId: "foundry-agent",
    blueprintRevision: manifest.payload.version,
    inlineServiceId: "agent-discovery",
    invoke: "$discoverAgents",
    subject: { kind: "chat", blueprintId: "foundry-agent", turnId: "access" },
  });
  const record = await queueFace.submit({ service: "agent-discovery", operation: "discover", input: {} });
  if (record.status !== "completed" || !Array.isArray(record.result?.output)
    || record.result.output.some((value) => typeof value !== "string")) {
    throw new Error(record.error || "Foundry agent discovery failed");
  }
  return record.result.output as string[];
}

export const wrapOrchestrator: NonNullable<LoadBundleOptions["wrapOrchestrator"]> = (fallback, state) => {
  const queueFace = createFoundryAgentQueueFace(state);
  queueFace.assertSatisfies(declarations);
  return queueFace.createOrchestrator(fallback);
};
