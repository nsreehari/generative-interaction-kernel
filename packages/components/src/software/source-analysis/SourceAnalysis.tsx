import React from "react";
import { Text } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView, ProjectionViewProps } from "@gik/react";

import { SourceViewer, getSourceViewerSchema, validateSourceViewer } from "../../primitives/source-viewer";
import { componentRootProps, records, textAt } from "../../shared/component";
import { componentNode, defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";

export const SOURCE_FINDINGS_VARIANTS = ["findings", "text"] as const;
export const SOURCE_COMPARISON_VARIANTS = ["unified-diff", "split-diff", "text"] as const;

function sourceSchema(variants: readonly string[]) {
  const schema = JSON.parse(JSON.stringify(getSourceViewerSchema())) as Record<string, any>;
  schema.properties.variant = { enum: variants };
  schema.properties.spec.properties.density = { enum: ["comfortable", "compact"] };
  delete schema.properties.spec.properties.kind;
  schema.properties.spec.required = schema.properties.spec.required.filter((name: string) => name !== "kind");
  return schema as Record<string, unknown>;
}

const findingsSchema = sourceSchema(SOURCE_FINDINGS_VARIANTS);
const comparisonSchema = sourceSchema(SOURCE_COMPARISON_VARIANTS);

function sourceProps(value: Record<string, Json>, kind: "source" | "unified-diff" | "split-diff") {
  const spec = { ...((value.spec ?? {}) as Record<string, Json>) };
  const density = spec.density;
  delete spec.density;
  spec.kind = kind;
  return { ...value, variant: density === "compact" ? "compact" : "standard", spec };
}

function textItems(node: ProjectionViewProps["node"], labelField: string, detailField?: string) {
  const spec = (node.props.spec ?? {}) as Record<string, any>;
  const items = records(node.props.lines);
  if (items.length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No source data."}</Text>;
  return <section {...componentRootProps(node)}>{spec.title ? <Text block weight="semibold">{spec.title}</Text> : null}{items.map((item, index) => { const label = textAt(item, labelField); const detail = detailField ? textAt(item, detailField) : ""; return <Text block key={`${label}-${index}`}>- {label}{detail ? `: ${detail}` : ""}</Text>; })}</section>;
}

export const SourceFindings: ProjectionView = ({ node, emit }) => node.props.variant === "text"
  ? textItems(node, String((node.props.spec as any).fields.text), (node.props.spec as any).fields.annotation)
  : <SourceViewer node={componentNode(`${node.id}-source`, "primitive:source-viewer", sourceProps(node.props, "source"))} emit={emit} children={undefined} />;

export const SourceComparison: ProjectionView = ({ node, emit }) => node.props.variant === "text"
  ? textItems(node, String((node.props.spec as any).fields.afterText), (node.props.spec as any).fields.beforeText)
  : <SourceViewer node={componentNode(`${node.id}-diff`, "primitive:source-viewer", sourceProps(node.props, node.props.variant === "split-diff" ? "split-diff" : "unified-diff"))} emit={emit} children={undefined} />;

const findingsDescription: ComponentDescription = { capability: "software:source-findings", summary: "Presents line-addressable software source findings or a textual fallback.", dataProp: "lines", events: [], semanticTokens: [], defaultVariant: "findings", variants: [{ value: "findings", summary: "Annotated source findings.", useWhen: ["Findings attach to exact source lines"] }, { value: "text", summary: "Linear textual findings.", useWhen: ["Visual source rendering is unavailable"] }], authoring: { useWhen: ["Findings attach to exact software source lines"], avoidWhen: ["Evidence spans unrelated sources without line references"], rules: ["Map source line, text, and annotation fields", "Do not infer findings in the renderer"] } };
const comparisonDescription: ComponentDescription = { capability: "software:source-comparison", summary: "Presents precomputed software source changes as unified diff, split diff, or text.", dataProp: "lines", events: [], semanticTokens: [], defaultVariant: "unified-diff", variants: SOURCE_COMPARISON_VARIANTS.map((value) => ({ value, summary: `${value} source comparison.`, useWhen: [`The ${value} presentation matches the review surface`] })), authoring: { useWhen: ["Users need to compare two aligned software source versions"], avoidWhen: ["Only one source is present"], rules: ["Supply precomputed aligned diff rows", "Do not calculate or interpret changes in the renderer"] } };

export function validateSourceFindings(props: unknown): ComponentValidationReport { const report = runDeclarativeValidators([{ kind: "ajv-schema", schema: findingsSchema, message: "Invalid software:source-findings props", code: "software-source-findings-schema" }], props as Json); return report.ok ? validateSourceViewer(sourceProps(props as Record<string, Json>, "source")) : report; }
export function validateSourceComparison(props: unknown): ComponentValidationReport { const report = runDeclarativeValidators([{ kind: "ajv-schema", schema: comparisonSchema, message: "Invalid software:source-comparison props", code: "software-source-comparison-schema" }], props as Json); if (!report.ok) return report; const value = props as Record<string, Json>; return validateSourceViewer(sourceProps(value, value.variant === "split-diff" ? "split-diff" : "unified-diff")); }
export function materializeSourceFindingsTrial() { return trialNode("software:source-findings", { variant: "findings", lines: [{ line: 41, text: "if (riskScore >= threshold) {", note: "Inclusive threshold" }], spec: { title: "Source findings", density: "comfortable", fields: { number: "line", text: "text", annotation: "note" } } }); }
export function materializeSourceComparisonTrial() { return trialNode("software:source-comparison", { variant: "unified-diff", lines: [{ id: "41", beforeLine: 41, before: "riskScore > threshold", afterLine: 41, after: "riskScore >= threshold", change: "modified" }], spec: { title: "Policy comparison", density: "comfortable", fields: { id: "id", beforeNumber: "beforeLine", beforeText: "before", afterNumber: "afterLine", afterText: "after", change: "change" } } }); }
export const sourceFindingsDefinition = defineComponent({ description: findingsDescription, version: "1.0.0", component: SourceFindings, getSchema: () => findingsSchema, validate: validateSourceFindings, materializeTrial: materializeSourceFindingsTrial });
export const sourceComparisonDefinition = defineComponent({ description: comparisonDescription, version: "1.0.0", component: SourceComparison, getSchema: () => comparisonSchema, validate: validateSourceComparison, materializeTrial: materializeSourceComparisonTrial });