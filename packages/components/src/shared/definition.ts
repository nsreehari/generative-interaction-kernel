import type { Json, ResolvedNode } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";

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

export interface ComponentDescription {
  capability: string;
  summary: string;
  dataProp?: string;
  slots?: readonly string[];
  events: readonly string[];
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

export function trialNode(capability: string, props: Record<string, Json>): ResolvedNode {
  return {
    id: `${capability}-trial`,
    capability,
    props,
    visible: true,
    fallback: false,
    children: [],
  };
}