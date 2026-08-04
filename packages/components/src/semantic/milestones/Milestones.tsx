import React from "react";
import { Badge, Card, Text, makeStyles, tokens } from "@fluentui/react-components";
import type { Json, ResolvedNode } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import { componentRootProps, componentStylePropsSchema, records, textAt, type BadgeColor, type DataRecord } from "../../shared/component";
import { componentNode, defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";
import { Timeline, validateTimeline } from "../event-series";

export const MILESTONE_SEMANTIC_TOKENS = ["achieved", "current", "upcoming", "blocked", "unknown"] as const;
export const MILESTONE_VARIANTS = ["rail", "timeline", "list", "axis", "text"] as const;
type MilestoneToken = typeof MILESTONE_SEMANTIC_TOKENS[number];
type MilestoneVariant = typeof MILESTONE_VARIANTS[number];

interface MilestoneSpec {
  title?: string;
  description?: string;
  emptyText?: string;
  density?: "comfortable" | "compact";
  fields: { id: string; title: string; timestamp: string; detail?: string; status?: string; order?: string };
  scale?: { kind: "datetime" | "linear"; hourFormat?: "24" | "12"; displayPrefix?: string; minimum?: number; maximum?: number; tickStep?: number; showSeconds?: boolean; showTimeZone?: boolean };
  sort?: { direction: "ascending" | "descending" | "none" };
  toneMap?: Record<string, MilestoneToken>;
}

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#", type: "object", additionalProperties: false, required: ["milestones", "spec"],
  properties: {
    ...componentStylePropsSchema,
    milestones: { type: "array", items: { type: "object" } }, variant: { enum: MILESTONE_VARIANTS },
    spec: { type: "object", additionalProperties: false, required: ["fields"], properties: {
      title: { type: "string" }, description: { type: "string" }, emptyText: { type: "string" }, density: { enum: ["comfortable", "compact"] },
      fields: { type: "object", additionalProperties: false, required: ["id", "title", "timestamp"], properties: {
        id: { type: "string", minLength: 1 }, title: { type: "string", minLength: 1 }, timestamp: { type: "string", minLength: 1 },
        detail: { type: "string", minLength: 1 }, status: { type: "string", minLength: 1 }, order: { type: "string", minLength: 1 },
      } },
      scale: { type: "object", additionalProperties: false, required: ["kind"], properties: {
        kind: { enum: ["datetime", "linear"] }, hourFormat: { enum: ["24", "12"] }, displayPrefix: { type: "string" }, minimum: { type: "number" }, maximum: { type: "number" }, tickStep: { type: "number", exclusiveMinimum: 0 }, showSeconds: { type: "boolean" }, showTimeZone: { type: "boolean" },
      } },
      sort: { type: "object", additionalProperties: false, required: ["direction"], properties: { direction: { enum: ["ascending", "descending", "none"] } } },
      toneMap: { type: "object", additionalProperties: { enum: MILESTONE_SEMANTIC_TOKENS } },
    } },
  },
} as const;

const useStyles = makeStyles({
  root: { display: "grid", gap: tokens.spacingVerticalM, minWidth: 0, maxWidth: "52rem" },
  header: { display: "grid", gap: tokens.spacingVerticalXXS },
  description: { color: tokens.colorNeutralForeground3 },
  rail: { position: "relative", display: "grid", gap: tokens.spacingVerticalL, paddingBlock: tokens.spacingVerticalXS, "::before": { content: '""', position: "absolute", top: tokens.spacingVerticalM, bottom: tokens.spacingVerticalM, left: "0.45rem", width: tokens.strokeWidthThick, backgroundColor: tokens.colorNeutralStroke1 } },
  railItem: { position: "relative", display: "grid", gridTemplateColumns: "1rem minmax(0, 1fr)", gap: tokens.spacingHorizontalL },
  marker: { zIndex: 1, width: "0.65rem", height: "0.65rem", marginTop: "0.35rem", marginLeft: "0.1rem", boxSizing: "border-box", transform: "rotate(45deg)", border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorNeutralBackground1 },
  markerAchieved: { backgroundColor: tokens.colorPaletteGreenBackground3 },
  markerCurrent: { backgroundColor: tokens.colorBrandBackground },
  markerBlocked: { backgroundColor: tokens.colorPaletteRedBackground3 },
  content: { display: "grid", gap: tokens.spacingVerticalXS, minWidth: 0 },
  titleRow: { display: "flex", alignItems: "baseline", gap: tokens.spacingHorizontalS, flexWrap: "wrap" },
  railTitle: { fontFamily: tokens.fontFamilyMonospace, letterSpacing: 0 },
  detail: { color: tokens.colorNeutralForeground2 },
  time: { color: tokens.colorNeutralForeground3, fontVariantNumeric: "tabular-nums" },
  list: { display: "grid", gap: tokens.spacingVerticalS },
  listItem: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "start", gap: tokens.spacingHorizontalM },
  text: { display: "grid", gap: tokens.spacingVerticalXS },
});

function color(token: MilestoneToken | undefined): BadgeColor {
  if (token === "achieved") return "success";
  if (token === "current") return "brand";
  if (token === "upcoming") return "warning";
  if (token === "blocked") return "danger";
  return "informative";
}

function orderedMilestones(items: DataRecord[], spec: MilestoneSpec) {
  if (spec.fields.order) return [...items].sort((left, right) => Number(textAt(left, spec.fields.order)) - Number(textAt(right, spec.fields.order)));
  if (spec.sort?.direction === "none") return items;
  const direction = spec.sort?.direction === "descending" ? -1 : 1;
  return [...items].sort((left, right) => textAt(left, spec.fields.timestamp).localeCompare(textAt(right, spec.fields.timestamp)) * direction);
}

function timelineProps(props: ResolvedNode["props"], spec: MilestoneSpec, variant: "standard" | "axis"): Record<string, Json> {
  const toneMap = Object.fromEntries(Object.entries(spec.toneMap ?? {}).map(([value, token]) => [value, token === "achieved" ? "past" : token])) as Record<string, Json>;
  return {
    items: props.milestones,
    variant,
    spec: {
      ...(spec.title ? { title: spec.title } : {}), ...(spec.description ? { description: spec.description } : {}), ...(spec.emptyText ? { emptyText: spec.emptyText } : {}),
      fields: { id: spec.fields.id, title: spec.fields.title, timestamp: spec.fields.timestamp, ...(spec.fields.detail ? { detail: spec.fields.detail } : {}), ...(spec.fields.status ? { status: spec.fields.status } : {}) },
      ...(spec.scale ? { scale: spec.scale } : {}), sort: spec.sort ?? { direction: "ascending" }, toneMap,
    },
    ...(typeof props.className === "string" ? { className: props.className } : {}), ...(props.style ? { style: props.style } : {}),
  } as Record<string, Json>;
}

export const Milestones: ProjectionView = ({ node, emit }) => {
  const styles = useStyles();
  const milestones = records(node.props.milestones);
  const spec = (node.props.spec ?? {}) as unknown as MilestoneSpec;
  const variant = (node.props.variant ?? "rail") as MilestoneVariant;
  if (!spec.fields || milestones.length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No milestones available."}</Text>;
  if (variant === "timeline" || variant === "axis") return <Timeline node={componentNode(`${node.id}-${variant}`, "semantic:timeline", timelineProps(node.props, spec, variant === "axis" ? "axis" : "standard"))} emit={emit} children={undefined} />;
  const ordered = orderedMilestones(milestones, spec);
  const header = spec.title || spec.description ? <header className={styles.header}>{spec.title ? <Text weight="semibold" size={500}>{spec.title}</Text> : null}{spec.description ? <Text className={styles.description}>{spec.description}</Text> : null}</header> : null;
  const root = componentRootProps(node, styles.root);

  if (variant === "text") return <section {...root}>{header}<div className={styles.text}>{ordered.map((milestone) => <Text key={textAt(milestone, spec.fields.id)}>{textAt(milestone, spec.fields.timestamp)} - {textAt(milestone, spec.fields.title)}{spec.fields.detail ? `: ${textAt(milestone, spec.fields.detail)}` : ""}{spec.fields.status ? ` [${textAt(milestone, spec.fields.status)}]` : ""}</Text>)}</div></section>;
  if (variant === "list") return <section {...root}>{header}<div className={styles.list}>{ordered.map((milestone) => { const status = textAt(milestone, spec.fields.status); const token = status ? spec.toneMap?.[status] : undefined; return <Card appearance="outline" className={styles.listItem} key={textAt(milestone, spec.fields.id)}><div className={styles.content}><Text weight="semibold">{textAt(milestone, spec.fields.title)}</Text>{spec.fields.detail ? <Text className={styles.detail}>{textAt(milestone, spec.fields.detail)}</Text> : null}</div><div className={styles.content}><Text className={styles.time} size={200}>{textAt(milestone, spec.fields.timestamp)}</Text>{status ? <Badge appearance="tint" color={color(token)}>{status}</Badge> : null}</div></Card>; })}</div></section>;
  return <section {...root}>{header}<div className={styles.rail}>{ordered.map((milestone) => { const status = textAt(milestone, spec.fields.status); const token = status ? spec.toneMap?.[status] : undefined; const markerClass = token === "achieved" ? styles.markerAchieved : token === "current" ? styles.markerCurrent : token === "blocked" ? styles.markerBlocked : undefined; return <section className={styles.railItem} key={textAt(milestone, spec.fields.id)}><span className={`${styles.marker} ${markerClass ?? ""}`} aria-hidden="true" /><div className={styles.content}><div className={styles.titleRow}><Text className={styles.railTitle} as="h3" weight="semibold" size={500}>{textAt(milestone, spec.fields.title)}</Text>{status ? <Badge appearance="tint" color={color(token)}>{status}</Badge> : null}</div><Text className={styles.time} size={200}>{textAt(milestone, spec.fields.timestamp)}</Text>{spec.fields.detail ? <Text className={styles.detail}>{textAt(milestone, spec.fields.detail)}</Text> : null}</div></section>; })}</div></section>;
};

const description: ComponentDescription = {
  capability: "semantic:milestones", summary: "Presents authored dated checkpoints as a rail, timeline, list, axis, or text without changing milestone meaning.", dataProp: "milestones", events: [], semanticTokens: MILESTONE_SEMANTIC_TOKENS, defaultVariant: "rail",
  variants: [
    { value: "rail", summary: "Vertical milestone progression with diamond checkpoints.", useWhen: ["Ordered checkpoint progress should be rapidly scannable"] },
    { value: "timeline", summary: "Dated vertical milestone chronology.", useWhen: ["Milestone dates are the primary reading path"] },
    { value: "list", summary: "Compact milestone records with date and state.", useWhen: ["Precise record scanning matters more than progression"] },
    { value: "axis", summary: "Scaled horizontal milestone axis.", useWhen: ["Temporal spacing between milestones matters"] },
    { value: "text", summary: "Complete linear milestone projection.", useWhen: ["Visual layout is unavailable or inappropriate"] },
  ],
  authoring: { useWhen: ["Records are meaningful dated targets or achievements"], avoidWhen: ["Records are procedural work phases; use process", "Records are general observed events; use event-series"], rules: ["All variants consume the same milestones", "Use authored order for rail and list when supplied", "Never infer milestone achievement from dates", "Put density and scale in spec"] },
};

export function getMilestonesSchema(): Record<string, unknown> { return schema as unknown as Record<string, unknown>; }
export function validateMilestones(props: unknown): ComponentValidationReport {
  const report = runDeclarativeValidators([
  { kind: "ajv-schema", schema: getMilestonesSchema(), message: "Invalid semantic:milestones props", code: "milestones-schema" },
  { kind: "jsonata", expr: "($field := data.spec.fields.id; $ids := data.milestones.$lookup($, $field); $count($ids) = $count($distinct($ids)))", message: "Milestone IDs must be unique", code: "milestones-unique-id" },
  ], props as Json);
  if (!report.ok) return report;
  const value = props as Record<string, Json>;
  return validateTimeline(timelineProps(value, value.spec as unknown as MilestoneSpec, "axis"));
}
export function materializeMilestonesTrial() { return trialNode("semantic:milestones", { variant: "rail", milestones: [{ id: "presets", title: "Loading presets", detail: "Configuration presets loaded successfully.", at: "2026-08-04T09:00:00Z", order: 1, state: "done" }, { id: "manager", title: "Building manager", detail: "Management surface is ready.", at: "2026-08-04T09:05:00Z", order: 2, state: "done" }, { id: "services", title: "Building open services", detail: "Service endpoints are being prepared.", at: "2026-08-04T09:10:00Z", order: 3, state: "active" }, { id: "preview", title: "Building preview", detail: "Production preview is queued.", at: "2026-08-04T09:15:00Z", order: 4, state: "next" }], spec: { title: "Release milestones", density: "comfortable", fields: { id: "id", title: "title", detail: "detail", timestamp: "at", order: "order", status: "state" }, scale: { kind: "datetime" }, sort: { direction: "ascending" }, toneMap: { done: "achieved", active: "current", next: "upcoming" } } }); }
export const milestonesDefinition = defineComponent({ description, version: "1.0.0", component: Milestones, getSchema: getMilestonesSchema, validate: validateMilestones, materializeTrial: materializeMilestonesTrial });