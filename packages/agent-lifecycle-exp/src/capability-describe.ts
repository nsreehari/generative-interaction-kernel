import type { AgentTool, JsonSchema } from "./types";

export interface CapabilitySelectionDescription {
  readonly for: readonly string[];
  readonly notFor?: readonly string[];
  readonly interaction?: string;
}

export interface CapabilityAuthoringDescription {
  readonly dataProps?: Readonly<Record<string, unknown>>;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly variants?: Readonly<Record<string, unknown>>;
  readonly slots?: readonly string[];
  readonly emits?: Readonly<Record<string, unknown>>;
  readonly constraints?: readonly string[];
  readonly notes?: readonly string[];
  readonly example?: Readonly<Record<string, unknown>>;
}

export interface CapabilityDescribeCatalog {
  readonly catalog: Readonly<Record<string, CapabilitySelectionDescription>>;
  readonly details: Readonly<Record<string, CapabilityAuthoringDescription>>;
}

export const capabilityDescribeInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "capabilities"],
  properties: {
    kind: { type: "string", enum: ["catalog-capabilities", "multiple-capabilities"] },
    capabilities: {
      type: "array",
      items: { type: "string", minLength: 1 },
      maxItems: 32,
      uniqueItems: true,
    },
  },
};

function requestedCapabilityIds(
  catalog: CapabilityDescribeCatalog,
  value: unknown,
  requireSelection: boolean,
): string[] {
  if (value === undefined && !requireSelection) return Object.keys(catalog.catalog);
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string")) {
    throw new Error("describe capabilities must be an array of capability IDs");
  }
  if (requireSelection && value.length === 0) {
    throw new Error("describe kind 'multiple-capabilities' requires at least one capability ID");
  }
  const ids = value.length === 0 ? Object.keys(catalog.catalog) : [...new Set(value)];
  const unknown = ids.filter((id) => !catalog.catalog[id] || !catalog.details[id]);
  if (unknown.length > 0) throw new Error(`Unknown capabilities: ${unknown.join(", ")}`);
  return ids;
}

export function createCapabilityDescribeTool(catalog: CapabilityDescribeCatalog): AgentTool {
  return {
    name: "describe",
    description: "Discover projection capabilities or retrieve compact contracts for multiple shortlisted capabilities in one call.",
    inputSchema: capabilityDescribeInputSchema,
    lifecycle: "agent",
    handler: (args) => {
      if (!args || typeof args !== "object" || Array.isArray(args)) {
        throw new Error("describe requires an object input");
      }
      const input = args as Record<string, unknown>;
      if (input.kind === "catalog-capabilities") {
        const ids = requestedCapabilityIds(catalog, input.capabilities, false);
        return {
          capabilities: Object.fromEntries(ids.map((id) => [id, catalog.catalog[id]])),
        };
      }
      if (input.kind === "multiple-capabilities") {
        const ids = requestedCapabilityIds(catalog, input.capabilities, true);
        return {
          capabilities: Object.fromEntries(ids.map((id) => [id, catalog.details[id]])),
        };
      }
      throw new Error(`Unsupported describe kind '${String(input.kind)}'`);
    },
  };
}
