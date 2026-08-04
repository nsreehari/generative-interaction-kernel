import React from "react";
import { Card, Text } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView, ProjectionViewProps } from "@gik/react";

import { componentRootProps, records, textAt, type DataRecord } from "../shared/component";
import { componentNode, defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../shared/definition";
import { DecisionSummary, DECISION_SUMMARY_SEMANTIC_TOKENS, getDecisionSummarySchema, validateDecisionSummary } from "./decision";
import { EntityConstellation, ENTITY_CONSTELLATION_SEMANTIC_TOKENS, getEntityConstellationSchema, validateEntityConstellation } from "./entity-set";
import { EvidenceTrail, EVIDENCE_TRAIL_SEMANTIC_TOKENS, getEvidenceTrailSchema, validateEvidenceTrail } from "./evidence-case";
import { Sequence, SEQUENCE_SEMANTIC_TOKENS, getSequenceSchema, validateSequence } from "./process";
import { Timeline, TIMELINE_SEMANTIC_TOKENS, getTimelineSchema, validateTimeline } from "./event-series";

type Schema = Record<string, any>;
type VariantMap = Record<string, string>;

const densitySchema = { enum: ["comfortable", "compact"] } as const;

function canonicalSchema(baseSchema: Record<string, unknown>, variants: readonly string[]): Record<string, unknown> {
  const schema = JSON.parse(JSON.stringify(baseSchema)) as Schema;
  schema.properties.variant = { enum: variants };
  schema.properties.spec.properties.density = densitySchema;
  return schema;
}

function delegatedProps(props: Record<string, Json>, variant: string): Record<string, Json> {
  const spec = { ...((props.spec ?? {}) as Record<string, Json>) };
  delete spec.density;
  return { ...props, variant, spec };
}

function canonicalVariant(props: Record<string, Json>, defaultVariant: string): string {
  return typeof props.variant === "string" ? props.variant : defaultVariant;
}

function mappedVariant(props: Record<string, Json>, variants: VariantMap, defaultVariant: string): string {
  const variant = canonicalVariant(props, defaultVariant);
  const density = (props.spec as Record<string, Json> | undefined)?.density;
  const mapped = variants[variant];
  return density === "compact" && mapped === "standard" ? "compact" : mapped;
}

function delegate(Component: ProjectionView, node: ProjectionViewProps["node"], emit: ProjectionViewProps["emit"], variant: string) {
  return <Component node={componentNode(`${node.id}-delegate`, Component.name, delegatedProps(node.props, variant))} emit={emit} children={undefined} />;
}

function validateCanonical(
  capability: string,
  schema: Record<string, unknown>,
  props: unknown,
  map: (props: Record<string, Json>) => Record<string, Json>,
  validateLegacy: (props: unknown) => ComponentValidationReport,
): ComponentValidationReport {
  const report = runDeclarativeValidators([{ kind: "ajv-schema", schema, message: `Invalid ${capability} props`, code: `${capability.replace(":", "-")}-schema` }], props as Json);
  if (!report.ok) return report;
  return validateLegacy(map(props as Record<string, Json>));
}

function textItems(node: ProjectionViewProps["node"], dataProp: string, labelField: string, detailField?: string) {
  const spec = (node.props.spec ?? {}) as Record<string, any>;
  const items = records(node.props[dataProp]);
  if (items.length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No data available."}</Text>;
  return <section {...componentRootProps(node)}>{spec.title ? <Text block weight="semibold">{spec.title}</Text> : null}{items.map((item, index) => {
    const label = textAt(item, labelField);
    const detail = detailField ? textAt(item, detailField) : "";
    return <Text block key={`${label}-${index}`}>- {label}{detail ? `: ${detail}` : ""}</Text>;
  })}</section>;
}

function definition(description: ComponentDescription, component: ProjectionView, schema: Record<string, unknown>, validate: (props: unknown) => ComponentValidationReport, materializeTrial: () => ReturnType<typeof trialNode>) {
  return defineComponent({ description, version: "1.0.0", component, getSchema: () => schema, validate, materializeTrial });
}

function variants(values: readonly string[]) {
  return values.map((value) => ({ value, summary: `${value} presentation.`, useWhen: [`The ${value} presentation best matches the authored intent`] }));
}

export const EVENT_SERIES_VARIANTS = ["chronology", "axis", "text"] as const;
const eventSeriesSchema = canonicalSchema(getTimelineSchema(), EVENT_SERIES_VARIANTS);
const eventSeriesMap: VariantMap = { chronology: "standard", axis: "axis", text: "minimal" };
export const EventSeries: ProjectionView = ({ node, emit }) => delegate(Timeline, node, emit, mappedVariant(node.props, eventSeriesMap, "chronology"));
const eventSeriesDescription: ComponentDescription = { capability: "semantic:event-series", summary: "Presents temporally ordered events as a chronology, shared axis, or text.", dataProp: "items", events: [], semanticTokens: TIMELINE_SEMANTIC_TOKENS, defaultVariant: "chronology", variants: variants(EVENT_SERIES_VARIANTS), authoring: { useWhen: ["Timestamped events form the primary relationship"], avoidWhen: ["Order is procedural rather than temporal"], rules: ["Map stable identity, title, and timestamp fields", "Put density and scale configuration in spec"] } };
export function materializeEventSeriesTrial() { return trialNode("semantic:event-series", { variant: "chronology", items: [{ eventKey: "evt-1", at: "2026-08-04T09:10:00Z", title: "Signal detected", detail: "An anomalous sign-in was observed.", state: "resolved" }, { eventKey: "evt-2", at: "2026-08-04T09:24:00Z", title: "Investigation opened", detail: "The identity team began triage.", state: "active" }], spec: { title: "Investigation timeline", description: "Ordered operational events", density: "comfortable", fields: { id: "eventKey", title: "title", timestamp: "at", detail: "detail", status: "state" }, scale: { kind: "datetime" }, sort: { direction: "ascending" }, toneMap: { resolved: "past", active: "current" } } }); }
export const eventSeriesDefinition = definition(eventSeriesDescription, EventSeries, eventSeriesSchema, (props) => validateCanonical("semantic:event-series", eventSeriesSchema, props, (value) => delegatedProps(value, mappedVariant(value, eventSeriesMap, "chronology")), validateTimeline), materializeEventSeriesTrial);

export const PROCESS_VARIANTS = ["flow", "stages", "text"] as const;
const processSchema = canonicalSchema(getSequenceSchema(), PROCESS_VARIANTS);
const processMap: VariantMap = { flow: "standard", stages: "compact" };
export const Process: ProjectionView = ({ node, emit }) => canonicalVariant(node.props, "flow") === "text"
  ? textItems(node, "items", String((node.props.spec as any).fields.title), (node.props.spec as any).fields.detail)
  : delegate(Sequence, node, emit, mappedVariant(node.props, processMap, "flow"));
const processDescription: ComponentDescription = { capability: "semantic:process", summary: "Presents ordered process steps as a flow, stages, or text.", dataProp: "items", events: [], semanticTokens: SEQUENCE_SEMANTIC_TOKENS, defaultVariant: "flow", variants: variants(PROCESS_VARIANTS), authoring: { useWhen: ["Records are ordered procedural steps"], avoidWhen: ["Timestamps are the primary ordering relationship"], rules: ["Use the existing sequence field and orientation contract", "Put density and orientation in spec"] } };
export function materializeProcessTrial() { return trialNode("semantic:process", { variant: "flow", items: [{ key: "s1", order: 1, label: "Detect", state: "done", detail: "Signal identified" }, { key: "s2", order: 2, label: "Investigate", state: "active", detail: "Evidence under review" }], spec: { title: "Response process", density: "comfortable", orientation: "horizontal", fields: { id: "key", title: "label", order: "order", detail: "detail", status: "state" }, toneMap: { done: "complete", active: "current" } } }); }
export const processDefinition = definition(processDescription, Process, processSchema, (props) => validateCanonical("semantic:process", processSchema, props, (value) => delegatedProps(value, canonicalVariant(value, "flow") === "text" ? "compact" : mappedVariant(value, processMap, "flow")), validateSequence), materializeProcessTrial);

export const ENTITY_SET_VARIANTS = ["clusters", "matrix", "list", "text"] as const;
const entitySetSchema = canonicalSchema(getEntityConstellationSchema(), ENTITY_SET_VARIANTS);
function entityFields(node: ProjectionViewProps["node"]) { return (node.props.spec as any).fields as { label: string; description?: string; type?: string; status?: string }; }
export const EntitySet: ProjectionView = ({ node, emit }) => {
  const variant = canonicalVariant(node.props, "clusters");
  if (variant === "clusters") return delegate(EntityConstellation, node, emit, (node.props.spec as any).density === "compact" ? "compact" : "grouped");
  const fields = entityFields(node);
  if (variant === "text") return textItems(node, "items", fields.label, fields.description);
  const items = records(node.props.items);
  if (variant === "list") return <section {...componentRootProps(node)}>{items.map((item, index) => <Card key={`${textAt(item, fields.label)}-${index}`}><Text weight="semibold">{textAt(item, fields.label)}</Text>{fields.description ? <Text block>{textAt(item, fields.description)}</Text> : null}</Card>)}</section>;
  return <table {...componentRootProps(node)}><thead><tr><th>Entity</th><th>Type</th><th>Status</th></tr></thead><tbody>{items.map((item, index) => <tr key={`${textAt(item, fields.label)}-${index}`}><td>{textAt(item, fields.label)}</td><td>{textAt(item, fields.type)}</td><td>{textAt(item, fields.status)}</td></tr>)}</tbody></table>;
};
const entitySetDescription: ComponentDescription = { capability: "semantic:entity-set", summary: "Presents an entity population as clusters, a matrix, a list, or text.", dataProp: "items", events: [], semanticTokens: ENTITY_CONSTELLATION_SEMANTIC_TOKENS, defaultVariant: "clusters", variants: variants(ENTITY_SET_VARIANTS), authoring: { useWhen: ["A population of entities is the semantic subject"], avoidWhen: ["Relationships between entities are primary"], rules: ["Use clusters only when grouping is meaningful", "Use mapped fields for matrix, list, and text projections"] } };
export function materializeEntitySetTrial() { return trialNode("semantic:entity-set", { variant: "clusters", items: [{ key: "u1", name: "Admin account", kind: "identity", condition: "compromised", group: "impacted", detail: "Privileged account" }], spec: { title: "Entity set", density: "comfortable", fields: { id: "key", label: "name", type: "kind", status: "condition", group: "group", description: "detail" }, groups: [{ value: "impacted", label: "Impacted" }], toneMap: { compromised: "affected" } } }); }
export const entitySetDefinition = definition(entitySetDescription, EntitySet, entitySetSchema, (props) => validateCanonical("semantic:entity-set", entitySetSchema, props, (value) => delegatedProps(value, "grouped"), validateEntityConstellation), materializeEntitySetTrial);

export const EVIDENCE_CASE_VARIANTS = ["case", "sources", "chain", "text"] as const;
const evidenceCaseSchema = canonicalSchema(getEvidenceTrailSchema(), EVIDENCE_CASE_VARIANTS);
export const EvidenceCase: ProjectionView = ({ node, emit }) => {
  const variant = canonicalVariant(node.props, "case");
  const fields = (node.props.spec as any).fields;
  if (variant === "chain") return delegate(EvidenceTrail, node, emit, "detailed");
  if (variant === "sources") return delegate(EvidenceTrail, node, emit, "compact");
  if (variant === "text") return textItems(node, "evidence", fields.title, fields.excerpt);
  return <section {...componentRootProps(node)}>{(node.props.spec as any).title ? <Text block weight="semibold">{(node.props.spec as any).title}</Text> : null}{records(node.props.evidence).map((item, index) => <Card key={`${textAt(item, fields.id)}-${index}`}><Text block weight="semibold">{textAt(item, fields.title)}</Text><Text block>{textAt(item, fields.source)}</Text>{fields.excerpt ? <Text block>{textAt(item, fields.excerpt)}</Text> : null}</Card>)}</section>;
};
const evidenceCaseDescription: ComponentDescription = { capability: "semantic:evidence-case", summary: "Groups sourced evidence as a case, source scan, evidence chain, or text.", dataProp: "evidence", events: [], semanticTokens: EVIDENCE_TRAIL_SEMANTIC_TOKENS, defaultVariant: "case", variants: variants(EVIDENCE_CASE_VARIANTS), authoring: { useWhen: ["Evidence collectively supports or challenges a case"], avoidWhen: ["Records are merely chronological"], rules: ["Use chain for ordered provenance", "Do not invent excerpts or source attribution"] } };
export function materializeEvidenceCaseTrial() { return trialNode("semantic:evidence-case", { variant: "case", evidence: [{ id: "ev-1", title: "Unfamiliar device registration", source: "Identity audit log", at: "09:14 UTC", excerpt: "Device credential registered after the first anomalous sign-in.", role: "corroborates" }, { id: "ev-2", title: "Conditional access challenge", source: "Sign-in log", at: "09:16 UTC", excerpt: "Challenge originated from the same network and user session.", role: "primary" }], spec: { title: "Evidence case", density: "comfortable", fields: { id: "id", title: "title", source: "source", timestamp: "at", excerpt: "excerpt", tone: "role" }, toneMap: { corroborates: "corroborating", primary: "primary" } } }); }
export const evidenceCaseDefinition = definition(evidenceCaseDescription, EvidenceCase, evidenceCaseSchema, (props) => validateCanonical("semantic:evidence-case", evidenceCaseSchema, props, (value) => delegatedProps(value, "detailed"), validateEvidenceTrail), materializeEvidenceCaseTrial);

export const DECISION_VARIANTS = ["summary", "rationale-chain", "text"] as const;
const decisionSchema = canonicalSchema(getDecisionSummarySchema(), DECISION_VARIANTS);
export const Decision: ProjectionView = ({ node, emit }) => {
  const variant = canonicalVariant(node.props, "summary");
  if (variant === "summary") return delegate(DecisionSummary, node, emit, (node.props.spec as any).density === "compact" ? "concise" : "detailed");
  const decision = node.props.decision as DataRecord;
  const fields = (node.props.spec as any).fields;
  if (variant === "text") return <Text {...componentRootProps(node)}>{textAt(decision, fields.title)}: {textAt(decision, fields.summary)} ({textAt(decision, fields.outcome)})</Text>;
  return <section {...componentRootProps(node)}><Text block weight="semibold">{textAt(decision, fields.title)}</Text><ol><li>{textAt(decision, fields.rationale)}</li><li>{textAt(decision, fields.outcome)}</li></ol></section>;
};
const decisionDescription: ComponentDescription = { capability: "semantic:decision", summary: "Presents a decision as a summary, rationale chain, or text.", dataProp: "decision", events: [], semanticTokens: DECISION_SUMMARY_SEMANTIC_TOKENS, defaultVariant: "summary", variants: variants(DECISION_VARIANTS), authoring: { useWhen: ["One decision and its justification are the focal result"], avoidWhen: ["Users must choose among interactive options"], rules: ["Map title, summary, outcome, and rationale", "Use rationale-chain only when reasoning order is meaningful"] } };
export function materializeDecisionTrial() { return trialNode("semantic:decision", { variant: "summary", decision: { title: "Contain affected identity", summary: "Evidence supports immediate containment.", verdict: { outcome: "approved", confidence: "high", rationale: "Correlated sign-in evidence" }, impact: "Reduces lateral movement risk" }, spec: { eyebrow: "Decision", density: "comfortable", fields: { title: "title", summary: "summary", outcome: "verdict.outcome", confidence: "verdict.confidence", rationale: "verdict.rationale", impact: "impact" }, toneMap: { approved: "affirmative" } } }); }
export const decisionDefinition = definition(decisionDescription, Decision, decisionSchema, (props) => validateCanonical("semantic:decision", decisionSchema, props, (value) => delegatedProps(value, "detailed"), validateDecisionSummary), materializeDecisionTrial);
