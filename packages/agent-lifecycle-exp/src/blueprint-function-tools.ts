import type { AgentFunctionToolDefinition } from "./function-tools";
import { createBlueprintLifecycleManifest, type BlueprintUseSource } from "./blueprint-use";
import { AGENT_LIFECYCLE_OPERATIONS } from "./types";

export const BLUEPRINT_USE_TARGET_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string" },
    id: { type: "string" },
    instanceId: { type: "string" },
  },
  required: ["kind", "id", "instanceId"],
  additionalProperties: false,
} as const;

export const BLUEPRINT_USE_SCHEMAS = {
  discover: { type: "object", properties: {}, additionalProperties: false },
  target: BLUEPRINT_USE_TARGET_SCHEMA,
  intent: {
    type: "object",
    properties: {
      kind: { type: "string" },
      target: BLUEPRINT_USE_TARGET_SCHEMA,
      payloadJson: { type: "string", description: "A JSON-serialized intent payload." },
      rationale: { type: ["string", "null"] },
    },
    required: ["kind", "target", "payloadJson", "rationale"],
    additionalProperties: false,
  },
  proposal: {
    type: "object",
    properties: {
      id: { type: "string" },
      capability: { type: "string" },
      target: BLUEPRINT_USE_TARGET_SCHEMA,
      actions: { type: "array" },
      createdAt: { type: "string" },
      rationale: { type: ["string", "null"] },
    },
    required: ["id", "capability", "target", "actions", "createdAt", "rationale"],
    additionalProperties: false,
  },
} as const;

export function blueprintUseFunctionTools(blueprint: BlueprintUseSource): AgentFunctionToolDefinition[] {
  const manifest = createBlueprintLifecycleManifest({
    blueprint,
    schemas: BLUEPRINT_USE_SCHEMAS,
    profile: "use",
  });
  return AGENT_LIFECYCLE_OPERATIONS.map((operation) => ({
    type: "function",
    name: `use_blueprint_${operation}`,
    description: operation === "manifest"
      ? `Return the machine-readable ${manifest.id} capability manifest.`
      : manifest.operations[operation].description,
    parameters: operation === "manifest"
      ? { type: "object", properties: {}, additionalProperties: false }
      : manifest.operations[operation].inputSchema,
    strict: true,
  }));
}