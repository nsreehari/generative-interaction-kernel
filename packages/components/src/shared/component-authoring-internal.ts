import type { Json, ResolvedNode } from "@gik/kernel";

import type {
  ComponentDescription,
  ComponentEventContract,
  ComponentValidationReport,
  DeclarativeComponentDefinition,
} from "./definition";
import type {
  AgentFacingCapabilityCatalog,
  AgentFacingCapabilityDetail,
  AgentFacingCapabilitySelection,
} from "./agent-facing";

export interface ComponentCatalogEntry {
  id: string;
  capability: string;
  version: string;
  summary: string;
  dataProp?: string;
  slots: readonly string[];
  defaultVariant?: string;
  variants: readonly string[];
  events: readonly string[];
  eventContracts: Readonly<Record<string, ComponentEventContract>>;
}

export interface ComponentAuthoringDescription extends ComponentDescription {
  version: string;
  propsSchema: Record<string, unknown>;
  eventContracts: Readonly<Record<string, ComponentEventContract>>;
}

export interface ComponentAuthoringTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => unknown;
  agentSafe: true;
}

export interface ComponentPreflightReport extends ComponentValidationReport {
  capability: string;
  effectiveVariant?: string;
  declaredEvents: readonly string[];
  eventContracts: Readonly<Record<string, ComponentEventContract>>;
}

export interface ComponentAgentKit {
  capabilities: readonly string[];
  instructions: string;
  tools: ComponentAuthoringTool[];
}

interface ComponentAuthoringApiConfig {
  definitions: Record<string, DeclarativeComponentDefinition>;
  kind: "semantic" | "primitive" | "fluent" | "security" | "software";
  toolKind: "Semantic" | "Primitive" | "Fluent" | "Security" | "Software";
}

const genericProps = new Set(["className", "style", "layout"]);

function schemaProperties(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = schema.properties;
  return properties && typeof properties === "object" && !Array.isArray(properties)
    ? properties as Record<string, unknown>
    : {};
}

function authoredExample(definition: DeclarativeComponentDefinition): Record<string, unknown> {
  const trial = definition.materializeTrial();
  const props = Object.fromEntries(
    Object.entries(trial.props).filter(([key]) => key !== definition.dataProp && !genericProps.has(key)),
  );
  return {
    capability: definition.capability,
    ...(Object.keys(props).length > 0 ? { props } : {}),
    ...(definition.dataProp
      ? { bindings: { [definition.dataProp]: { from: "<state-path>" } } }
      : {}),
  };
}

export function createAgentFacingCapabilityCatalog(
  definitions: Readonly<Record<string, DeclarativeComponentDefinition>>,
): AgentFacingCapabilityCatalog {
  const catalog: Record<string, AgentFacingCapabilitySelection> = {};
  const details: Record<string, AgentFacingCapabilityDetail> = {};
  for (const definition of Object.values(definitions)) {
    const description = definition.describe();
    const override = description.agentFacing;
    const properties = schemaProperties(definition.getSchema());
    const dataProps = {
      ...(definition.dataProp && properties[definition.dataProp] !== undefined
        ? { [definition.dataProp]: properties[definition.dataProp] }
        : {}),
      ...(override?.detail?.dataProps ?? {}),
    };
    const props = {
      ...Object.fromEntries(Object.entries(properties).filter(([key]) =>
        key !== definition.dataProp && key !== "variant" && !genericProps.has(key))),
      ...(override?.detail?.props ?? {}),
    };
    const variants = Object.fromEntries(description.variants.map((variant) => [
      variant.value,
      {
        summary: variant.summary,
        useWhen: variant.useWhen,
        ...(variant.value === description.defaultVariant ? { default: true as const } : {}),
      },
    ]));
    catalog[definition.capability] = {
      for: override?.catalog?.for ?? description.authoring.useWhen,
      ...((override?.catalog?.notFor ?? description.authoring.avoidWhen).length > 0
        ? { notFor: override?.catalog?.notFor ?? description.authoring.avoidWhen }
        : {}),
      ...(override?.catalog?.interaction ? { interaction: override.catalog.interaction } : {}),
    };
    details[definition.capability] = {
      ...(Object.keys(dataProps).length > 0 ? { dataProps } : {}),
      ...(Object.keys(props).length > 0 ? { props } : {}),
      ...(Object.keys(variants).length > 0 ? { variants } : {}),
      ...(description.slots?.length ? { slots: description.slots } : {}),
      ...(description.events.length > 0 ? { emits: definition.eventContracts } : {}),
      ...((override?.detail?.constraints ?? description.authoring.rules).length > 0
        ? { constraints: override?.detail?.constraints ?? description.authoring.rules }
        : {}),
      ...(override?.detail?.notes?.length ? { notes: override.detail.notes } : {}),
      example: override?.detail?.example ?? authoredExample(definition),
    };
  }
  return { catalog, details };
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

export function createComponentAuthoringApi(config: ComponentAuthoringApiConfig) {
  const definitions = Object.entries(config.definitions);
  const allCapabilities = definitions.map(([, definition]) => definition.capability);
  const toolNames = {
    list: `list${config.toolKind}Components`,
    describe: `describe${config.toolKind}Component`,
    validate: `validate${config.toolKind}ComponentProps`,
    preflight: `preflight${config.toolKind}Component`,
    materialize: `materialize${config.toolKind}ComponentTrial`,
  };

  const findDefinition = (capability: string): [string, DeclarativeComponentDefinition] | undefined =>
    definitions.find(([id, definition]) => id === capability || definition.capability === capability);

  const resolveDefinition = (capability: string): DeclarativeComponentDefinition => {
    const match = findDefinition(capability);
    if (!match) throw new Error(`Unknown ${config.kind} component: ${capability}. Available capabilities: ${allCapabilities.join(", ")}`);
    return match[1];
  };

  const selectDefinitions = (components?: readonly string[]): Array<[string, DeclarativeComponentDefinition]> => {
    if (components === undefined) return definitions;
    if (components.length === 0) throw new Error(`At least one ${config.kind} component is required`);

    const selected = new Map<string, [string, DeclarativeComponentDefinition]>();
    for (const component of components) {
      const match = findDefinition(component);
      if (!match) throw new Error(`Unknown ${config.kind} component: ${component}. Available capabilities: ${allCapabilities.join(", ")}`);
      selected.set(match[1].capability, match);
    }
    return [...selected.values()];
  };

  const catalogEntries = (selected: Array<[string, DeclarativeComponentDefinition]>): ComponentCatalogEntry[] =>
    selected.map(([id, definition]) => ({
      id,
      capability: definition.capability,
      version: definition.version,
      summary: definition.summary,
      dataProp: definition.dataProp,
      slots: definition.slots ?? [],
      defaultVariant: definition.defaultVariant,
      variants: definition.variants.map((variant) => variant.value),
      events: definition.events,
      eventContracts: definition.eventContracts,
    }));

  const describe = (capability: string): ComponentAuthoringDescription => {
    const definition = resolveDefinition(capability);
    return {
      ...definition.describe(),
      eventContracts: definition.eventContracts,
      version: definition.version,
      propsSchema: definition.getSchema(),
    };
  };

  const materialize = (capability: string, variant?: string): ResolvedNode => {
    const definition = resolveDefinition(capability);
    const trial = definition.materializeTrial();
    if (variant !== undefined) trial.props.variant = variant as Json;
    const report = definition.validate(trial.props);
    if (!report.ok) throw new Error(report.errors.map((issue) => issue.detail).join("; "));
    return trial;
  };

  const preflight = (capability: string, props: unknown): ComponentPreflightReport => {
    const definition = resolveDefinition(capability);
    const candidate = typeof props === "object" && props !== null ? props as Record<string, unknown> : {};
    return {
      capability: definition.capability,
      effectiveVariant: typeof candidate.variant === "string" ? candidate.variant : definition.defaultVariant,
      declaredEvents: definition.events,
      eventContracts: definition.eventContracts,
      ...definition.validate(props),
    };
  };

  const instructions = (components?: readonly string[]): string => {
    const selected = selectDefinitions(components);
    const componentSections = selected.map(([, definition]) => {
      const description = definition.describe();
      const variants = description.variants.map((variant) =>
        `  - ${variant.value}${variant.value === description.defaultVariant ? " (default)" : ""}: ${variant.summary} Use when: ${variant.useWhen.join("; ")}`
      ).join("\n");
      const eventContracts = Object.entries(definition.eventContracts).map(([event, contract]) =>
        `  - ${event}: ${contract.summary} Payload schema: ${JSON.stringify(contract.payloadSchema)}`
      );
      return [
        `## ${description.capability}`,
        description.summary,
        `- Data prop: ${description.dataProp ?? "none"}`,
        `- Slots: ${description.slots?.join(", ") || "none"}`,
        `- Emitted events: ${description.events.length > 0 ? description.events.join(", ") : "none"}`,
        "- Event payload contracts:",
        ...(eventContracts.length > 0 ? eventContracts : ["  - none"]),
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
      `# GIK ${config.toolKind} Component Authoring`,
      "Use only the component contracts below. Their schemas are closed.",
      `Validate candidate props with ${toolNames.validate} or ${toolNames.preflight} before committing them.`,
      "Materialize a trial when mappings, tokens, variants, rendering, or event payload expectations change.",
      "Components are declarative projection leaves. They may emit declared semantic events, but they do not execute runtime behavior directly.",
      "Variants express stable presentation modes, not domain state, theme, or behavior. Omit variant when the default is appropriate.",
      "These are pure ACX authoring operations, not live AX runtime verification.",
      ...componentSections,
    ].join("\n\n");
  };

  const createTools = (components?: readonly string[]): ComponentAuthoringTool[] => {
    const selected = selectDefinitions(components);
    const selectedCapabilities = selected.map(([, definition]) => definition.capability);
    const capabilitySchema = { type: "string", enum: selectedCapabilities };
    const resolveSelected = (capability: string): DeclarativeComponentDefinition => {
      const match = selected.find(([id, definition]) => id === capability || definition.capability === capability);
      if (!match) throw new Error(`${config.toolKind} component ${capability} is outside this agent kit. Allowed capabilities: ${selectedCapabilities.join(", ")}`);
      return match[1];
    };

    return [{
      name: toolNames.list,
      description: `List the ${config.kind} projection components assigned to this authoring context, including variants, emitted events, and event payload contracts.`,
      inputSchema: objectSchema({}),
      handler: () => catalogEntries(selected),
      agentSafe: true,
    }, {
      name: toolNames.describe,
      description: `Describe one ${config.kind} component's schema, variants, tokens, events, and agent-facing authoring guidance before using it in a bundle.`,
      inputSchema: objectSchema({ capability: capabilitySchema }, ["capability"]),
      handler: (args) => {
        const definition = resolveSelected(String(args.capability));
        return {
          ...definition.describe(),
          eventContracts: definition.eventContracts,
          version: definition.version,
          propsSchema: definition.getSchema(),
        };
      },
      agentSafe: true,
    }, {
      name: toolNames.validate,
      description: `Preflight candidate props against a ${config.kind} component's closed schema and declarative validators.`,
      inputSchema: objectSchema({ capability: capabilitySchema, props: { type: "object" } }, ["capability", "props"]),
      handler: (args) => resolveSelected(String(args.capability)).validate(args.props),
      agentSafe: true,
    }, {
      name: toolNames.preflight,
      description: "Preflight candidate props and report validation, the effective variant, and declared events for bundle authoring.",
      inputSchema: objectSchema({ capability: capabilitySchema, props: { type: "object" } }, ["capability", "props"]),
      handler: (args) => {
        const definition = resolveSelected(String(args.capability));
        const candidate = typeof args.props === "object" && args.props !== null ? args.props as Record<string, unknown> : {};
        return {
          capability: definition.capability,
          effectiveVariant: typeof candidate.variant === "string" ? candidate.variant : definition.defaultVariant,
          declaredEvents: definition.events,
          eventContracts: definition.eventContracts,
          ...definition.validate(args.props),
        } satisfies ComponentPreflightReport;
      },
      agentSafe: true,
    }, {
      name: toolNames.materialize,
      description: `Materialize a valid trial node for one ${config.kind} component and optionally select one of its declared variants.`,
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
  };

  const getKit = (components?: readonly string[]): ComponentAgentKit => {
    const selected = selectDefinitions(components);
    const capabilities = selected.map(([, definition]) => definition.capability);
    return { capabilities, instructions: instructions(capabilities), tools: createTools(capabilities) };
  };

  return {
    agentFacingCatalog: () => createAgentFacingCapabilityCatalog(config.definitions),
    list: () => catalogEntries(definitions),
    describe,
    validate: (capability: string, props: unknown) => resolveDefinition(capability).validate(props),
    materialize,
    preflight,
    instructions,
    createTools,
    getKit,
  };
}