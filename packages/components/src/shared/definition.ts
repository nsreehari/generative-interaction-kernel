import type { Json, ResolvedNode } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";
import { withComponentLayoutPropsSchema } from "./component";

export interface ComponentAuthoringGuide {
  useWhen: readonly string[];
  avoidWhen: readonly string[];
  rules: readonly string[];
}

export interface ComponentVariantDescription {
  value: string;
  summary: string;
  useWhen: readonly string[];
}

export interface ComponentEventContract {
  summary: string;
  payloadSchema: Record<string, unknown>;
}

export function eventContract(
  summary: string,
  properties: Record<string, unknown> = {},
  required: readonly string[] = Object.keys(properties),
): ComponentEventContract {
  return {
    summary,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      ...(required.length > 0 ? { required } : {}),
      properties,
    },
  };
}

export interface ComponentDescription {
  capability: string;
  summary: string;
  dataProp?: string;
  slots?: readonly string[];
  events: readonly string[];
  eventContracts?: Readonly<Record<string, ComponentEventContract>>;
  semanticTokens: readonly string[];
  defaultVariant?: string;
  variants: readonly ComponentVariantDescription[];
  authoring: ComponentAuthoringGuide;
}

export interface ComponentValidationIssue {
  detail: string;
  code?: string;
}

export interface ComponentValidationReport {
  ok: boolean;
  errors: ComponentValidationIssue[];
  warnings: ComponentValidationIssue[];
}

export interface DeclarativeComponentDefinition {
  capability: string;
  version: string;
  summary: string;
  dataProp?: string;
  slots?: readonly string[];
  events: readonly string[];
  eventContracts: Readonly<Record<string, ComponentEventContract>>;
  semanticTokens: readonly string[];
  defaultVariant?: string;
  variants: readonly ComponentVariantDescription[];
  authoring: ComponentAuthoringGuide;
  component: ProjectionView;
  describe(): ComponentDescription;
  getSchema(): Record<string, unknown>;
  validate(props: unknown): ComponentValidationReport;
  materializeTrial(): ResolvedNode;
}

export interface ComponentDefinitionOptions {
  description: ComponentDescription;
  version: string;
  component: ProjectionView;
  getSchema(): Record<string, unknown>;
  validate(props: unknown): ComponentValidationReport;
  materializeTrial(): ResolvedNode;
}

function validateLayout(props: unknown): ComponentValidationIssue[] {
  if (!props || typeof props !== "object" || Array.isArray(props)) return [];
  const layout = (props as Record<string, unknown>).layout;
  if (layout === undefined) return [];
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) {
    return [{ code: "component-layout-schema", detail: "layout must be an object" }];
  }
  const layoutRecord = layout as Record<string, unknown>;
  if (Object.keys(layoutRecord).some((key) => key !== "slots")) {
    return [{ code: "component-layout-schema", detail: "layout only supports the slots property" }];
  }
  const slots = layoutRecord.slots;
  if (slots === undefined) return [];
  if (!Array.isArray(slots) || slots.some((assignment) => {
    if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) return true;
    const record = assignment as Record<string, unknown>;
    return Object.keys(record).some((key) => key !== "key" && key !== "slot")
      || typeof record.key !== "string" || record.key.length === 0
      || typeof record.slot !== "string" || record.slot.length === 0;
  })) {
    return [{ code: "component-layout-schema", detail: "layout.slots must contain { key, slot } string pairs" }];
  }
  return [];
}

function withoutLayout(props: unknown): unknown {
  if (!props || typeof props !== "object" || Array.isArray(props) || !("layout" in props)) return props;
  const { layout: _layout, ...componentProps } = props as Record<string, unknown>;
  return componentProps;
}

export function defineComponent({
  description,
  version,
  component,
  getSchema,
  validate,
  materializeTrial,
}: ComponentDefinitionOptions): DeclarativeComponentDefinition {
  return {
    capability: description.capability,
    version,
    summary: description.summary,
    dataProp: description.dataProp,
    slots: description.slots,
    events: description.events,
    eventContracts: description.eventContracts ?? {},
    semanticTokens: description.semanticTokens,
    defaultVariant: description.defaultVariant,
    variants: description.variants,
    authoring: description.authoring,
    component,
    describe: () => description,
    getSchema: () => withComponentLayoutPropsSchema(getSchema()),
    validate: (props) => {
      const layoutErrors = validateLayout(props);
      if (layoutErrors.length > 0) return { ok: false, errors: layoutErrors, warnings: [] };
      return validate(withoutLayout(props));
    },
    materializeTrial,
  };
}

export function componentNode(id: string, capability: string, props: Record<string, Json>): ResolvedNode {
  return {
    id,
    capability,
    props,
    visible: true,
    fallback: false,
    children: [],
  };
}

export function trialNode(capability: string, props: Record<string, Json>): ResolvedNode {
  return componentNode(`${capability.replace(/[^A-Za-z0-9_-]/g, "-")}-trial`, capability, props);
}