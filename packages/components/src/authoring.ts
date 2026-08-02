import type { Json, ResolvedNode } from "@gik/kernel";

import type {
  ComponentDescription,
  ComponentValidationReport,
  DeclarativeComponentDefinition,
} from "./definition";
import { semanticComponentDefinitions } from "./semantic-registry";

export interface SemanticComponentCatalogEntry {
  id: string;
  capability: string;
  version: string;
  summary: string;
  dataProp?: string;
  slots: readonly string[];
  defaultVariant?: string;
  variants: readonly string[];
  events: readonly string[];
}

export interface SemanticComponentAuthoringDescription extends ComponentDescription {
  version: string;
  propsSchema: Record<string, unknown>;
}

export interface ComponentAuthoringTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => unknown;
  agentSafe: true;
}

export interface SemanticComponentPreflightReport extends ComponentValidationReport {
  capability: string;
  effectiveVariant?: string;
  declaredEvents: readonly string[];
}

export interface SemanticComponentAgentKit {
  capabilities: readonly string[];
  instructions: string;
  tools: ComponentAuthoringTool[];
}

const definitions = Object.entries(semanticComponentDefinitions) as Array<
  [string, DeclarativeComponentDefinition]
>;
const allCapabilities = definitions.map(([, definition]) => definition.capability);

function findDefinition(capability: string): [string, DeclarativeComponentDefinition] | undefined {
  return definitions.find(([id, definition]) =>
    id === capability || definition.capability === capability
  );
}

function resolveDefinition(capability: string): DeclarativeComponentDefinition {
  const match = findDefinition(capability);
  if (!match) throw new Error(`Unknown semantic component: ${capability}. Available capabilities: ${allCapabilities.join(", ")}`);
  return match[1];
}

function selectDefinitions(components?: readonly string[]): Array<[string, DeclarativeComponentDefinition]> {
  if (components === undefined) return definitions;
  if (components.length === 0) throw new Error("At least one semantic component is required");

  const selected = new Map<string, [string, DeclarativeComponentDefinition]>();
  for (const component of components) {
    const match = findDefinition(component);
    if (!match) throw new Error(`Unknown semantic component: ${component}. Available capabilities: ${allCapabilities.join(", ")}`);
    selected.set(match[1].capability, match);
  }
  return [...selected.values()];
}

function catalogEntries(selected: Array<[string, DeclarativeComponentDefinition]>): SemanticComponentCatalogEntry[] {
  return selected.map(([id, definition]) => ({
    id,
    capability: definition.capability,
    version: definition.version,
    summary: definition.summary,
    dataProp: definition.dataProp,
    slots: definition.slots ?? [],
    defaultVariant: definition.defaultVariant,
    variants: definition.variants.map((variant) => variant.value),
    events: definition.events,
  }));
}

export function listSemanticComponents(): SemanticComponentCatalogEntry[] {
  return catalogEntries(definitions);
}

export function describeSemanticComponent(capability: string): SemanticComponentAuthoringDescription {
  const definition = resolveDefinition(capability);
  return {
    ...definition.describe(),
    version: definition.version,
    propsSchema: definition.getSchema(),
  };
}

export function validateSemanticComponentProps(
  capability: string,
  props: unknown,
): ComponentValidationReport {
  return resolveDefinition(capability).validate(props);
}

export function materializeSemanticComponentTrial(
  capability: string,
  variant?: string,
): ResolvedNode {
  const definition = resolveDefinition(capability);
  const trial = definition.materializeTrial();
  if (variant !== undefined) trial.props.variant = variant as Json;

  const report = definition.validate(trial.props);
  if (!report.ok) {
    throw new Error(report.errors.map((issue) => issue.detail).join("; "));
  }
  return trial;
}

export function preflightSemanticComponent(
  capability: string,
  props: unknown,
): SemanticComponentPreflightReport {
  const definition = resolveDefinition(capability);
  const validation = definition.validate(props);
  const candidate = typeof props === "object" && props !== null ? props as Record<string, unknown> : {};
  return {
    capability: definition.capability,
    effectiveVariant: typeof candidate.variant === "string" ? candidate.variant : definition.defaultVariant,
    declaredEvents: definition.events,
    ...validation,
  };
}

export function getSemanticComponentAgentInstructions(components?: readonly string[]): string {
  const selected = selectDefinitions(components);
  const componentSections = selected.map(([, definition]) => {
    const description = definition.describe();
    const variants = description.variants.map((variant) =>
      `  - ${variant.value}${variant.value === description.defaultVariant ? " (default)" : ""}: ${variant.summary} Use when: ${variant.useWhen.join("; ")}`
    ).join("\n");
    return [
      `## ${description.capability}`,
      description.summary,
      `- Data prop: ${description.dataProp ?? "none"}`,
      `- Slots: ${description.slots?.join(", ") || "none"}`,
      `- Emitted events: ${description.events.length > 0 ? description.events.join(", ") : "none"}`,
      `- Semantic tokens: ${description.semanticTokens.join(", ")}`,
      "- Use when:",
      ...description.authoring.useWhen.map((rule) => `  - ${rule}`),
      "- Avoid when:",
      ...description.authoring.avoidWhen.map((rule) => `  - ${rule}`),
      "- Variants:",
      variants,
      "- Authoring rules:",
      ...description.authoring.rules.map((rule) => `  - ${rule}`),
    ].join("\n");
  });

  return [
    "# GIK Semantic Component Authoring",
    "Use only the component contracts below. Their schemas are closed.",
    "Validate candidate props with validateSemanticComponentProps or preflightSemanticComponent before committing them.",
    "Materialize a trial when mappings, tokens, variants, rendering, or event payload expectations change.",
    "Components are declarative projection leaves. They may emit declared semantic events, but bundle reactions own state changes and external effects.",
    "Variants express stable presentation modes, not domain state, theme, or behavior. Omit variant when the default is appropriate.",
    "These are pure ACX authoring operations, not live AX runtime verification.",
    ...componentSections,
  ].join("\n\n");
}

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
export function createSemanticComponentAuthoringTools(
  components?: readonly string[],
): ComponentAuthoringTool[] {
  const selected = selectDefinitions(components);
  const selectedCapabilities = selected.map(([, definition]) => definition.capability);
  const capabilitySchema = { type: "string", enum: selectedCapabilities };
  const resolveSelected = (capability: string): DeclarativeComponentDefinition => {
    const match = selected.find(([id, definition]) => id === capability || definition.capability === capability);
    if (!match) throw new Error(`Semantic component ${capability} is outside this agent kit. Allowed capabilities: ${selectedCapabilities.join(", ")}`);
    return match[1];
  };

  return [{
    name: "listSemanticComponents",
    description: "List the semantic projection components assigned to this authoring context, including variants and emitted events.",
    inputSchema: objectSchema({}),
    handler: () => catalogEntries(selected),
    agentSafe: true,
  },
  {
    name: "describeSemanticComponent",
    description: "Describe one semantic component's schema, variants, tokens, events, and agent-facing authoring guidance before using it in a bundle.",
    inputSchema: objectSchema({ capability: capabilitySchema }, ["capability"]),
    handler: (args) => {
      const definition = resolveSelected(String(args.capability));
      return { ...definition.describe(), version: definition.version, propsSchema: definition.getSchema() };
    },
    agentSafe: true,
  },
  {
    name: "validateSemanticComponentProps",
    description: "Preflight candidate props against a semantic component's closed schema and declarative validators.",
    inputSchema: objectSchema({ capability: capabilitySchema, props: { type: "object" } }, ["capability", "props"]),
    handler: (args) => resolveSelected(String(args.capability)).validate(args.props),
    agentSafe: true,
  },
  {
    name: "preflightSemanticComponent",
    description: "Preflight candidate props and report validation, the effective variant, and declared events for bundle authoring.",
    inputSchema: objectSchema({ capability: capabilitySchema, props: { type: "object" } }, ["capability", "props"]),
    handler: (args) => {
      const definition = resolveSelected(String(args.capability));
      const candidate = typeof args.props === "object" && args.props !== null ? args.props as Record<string, unknown> : {};
      return {
        capability: definition.capability,
        effectiveVariant: typeof candidate.variant === "string" ? candidate.variant : definition.defaultVariant,
        declaredEvents: definition.events,
        ...definition.validate(args.props),
      } satisfies SemanticComponentPreflightReport;
    },
    agentSafe: true,
  },
  {
    name: "materializeSemanticComponentTrial",
    description: "Materialize a valid trial node for one semantic component and optionally select one of its declared variants.",
    inputSchema: objectSchema({ capability: capabilitySchema, variant: { type: "string" } }, ["capability"]),
    handler: (args) => {
      const definition = resolveSelected(String(args.capability));
      const trial = definition.materializeTrial();
      if (args.variant !== undefined) trial.props.variant = String(args.variant);
      const report = definition.validate(trial.props);
      if (!report.ok) throw new Error(report.errors.map((issue) => issue.detail).join("; "));
      return trial;
    },
    agentSafe: true,
  }];
}

export function getSemanticComponentAgentKit(
  components?: readonly string[],
): SemanticComponentAgentKit {
  const selected = selectDefinitions(components);
  const capabilities = selected.map(([, definition]) => definition.capability);
  return {
    capabilities,
    instructions: getSemanticComponentAgentInstructions(capabilities),
    tools: createSemanticComponentAuthoringTools(capabilities),
  };
}

export const semanticComponentAuthoringTools = createSemanticComponentAuthoringTools();