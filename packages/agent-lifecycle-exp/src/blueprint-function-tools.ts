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
      actions: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: { kind: { type: "string" }, payload: {} },
          required: ["kind", "payload"],
          additionalProperties: false,
        },
      },
      rationale: { type: ["string", "null"] },
    },
    required: ["actions", "rationale"],
    additionalProperties: false,
  },
  proposal: {
    type: "object",
    properties: {
      actions: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: { kind: { type: "string" }, payload: {} },
          required: ["kind", "payload"],
          additionalProperties: false,
        },
      },
      rationale: { type: ["string", "null"] },
    },
    required: ["actions", "rationale"],
    additionalProperties: false,
  },
} as const;

export const BLUEPRINT_AUTHOR_TARGET_SCHEMA = {
  type: "object",
  properties: {
    kind: { const: "blueprint-authoring-workspace" },
    id: { type: "string" },
    instanceId: { type: "string" },
  },
  required: ["kind", "id", "instanceId"],
  additionalProperties: false,
} as const;

export const BLUEPRINT_AUTHOR_SCHEMAS = {
  discover: { type: "object", properties: {}, additionalProperties: false },
  target: BLUEPRINT_AUTHOR_TARGET_SCHEMA,
  intent: {
    type: "object",
    properties: {
      kind: { type: "string" },
      target: BLUEPRINT_AUTHOR_TARGET_SCHEMA,
      artifact: { type: "object" },
      rationale: { type: ["string", "null"] },
    },
    required: ["kind", "target", "artifact", "rationale"],
    additionalProperties: false,
  },
  proposal: {
    type: "object",
    properties: {
      actions: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: { kind: { type: "string" }, payload: {} },
          required: ["kind", "payload"],
          additionalProperties: false,
        },
      },
      rationale: { type: ["string", "null"] },
    },
    required: ["actions", "rationale"],
    additionalProperties: false,
  },
} as const;

export const BLUEPRINT_STATIC_AUTHOR_SCHEMAS = {
  discover: { type: "object", properties: {}, additionalProperties: false },
  target: { type: "object", properties: {}, additionalProperties: false },
  intent: {
    type: "object",
    properties: {
      actions: {
        type: "array",
        minItems: 1,
        maxItems: 1,
        items: {
          type: "object",
          properties: {
            kind: { const: "publish-blueprint" },
            artifact: {
              type: "object",
              properties: {
                gik: { const: "0.1" },
                type: { const: "blueprint" },
                payload: { type: "object" },
              },
              required: ["gik", "type", "payload"],
              additionalProperties: false,
            },
          },
          required: ["kind", "artifact"],
          additionalProperties: false,
        },
      },
      rationale: { type: ["string", "null"] },
    },
    required: ["actions", "rationale"],
    additionalProperties: false,
  },
  proposal: {
    type: "object",
    properties: {
      actions: {
        type: "array",
        minItems: 1,
        maxItems: 1,
        items: {
          type: "object",
          properties: {
            kind: { const: "publish-blueprint" },
            artifact: {
              type: "object",
              properties: {
                gik: { const: "0.1" },
                type: { const: "blueprint" },
                payload: { type: "object" },
              },
              required: ["gik", "type", "payload"],
              additionalProperties: false,
            },
          },
          required: ["kind", "artifact"],
          additionalProperties: false,
        },
      },
      rationale: { type: ["string", "null"] },
    },
    required: ["actions", "rationale"],
    additionalProperties: false,
  },
} as const;

export function blueprintUseFunctionTools(blueprint: BlueprintUseSource): AgentFunctionToolDefinition[] {
  const manifest = createBlueprintLifecycleManifest({
    blueprint,
    schemas: BLUEPRINT_USE_SCHEMAS,
    profile: "use",
  });
  const operations = AGENT_LIFECYCLE_OPERATIONS.filter(
    (operation) => operation === "manifest" || manifest.operations[operation] !== undefined,
  );
  return operations.map((operation) => {
    const definition = operation === "manifest" ? undefined : manifest.operations[operation];
    return {
    type: "function",
    name: `use_blueprint_${operation}`,
    description: operation === "manifest"
      ? `Return the machine-readable ${manifest.id} capability manifest.`
      : definition!.description,
    parameters: operation === "manifest"
      ? { type: "object", properties: {}, additionalProperties: false }
      : definition!.inputSchema,
    strict: true,
    };
  });
}