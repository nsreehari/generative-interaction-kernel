import React from "react";
import {
  Badge,
  Card,
  CardHeader,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import {
  trialNode,
  type ComponentDescription,
  type ComponentValidationReport,
  type DeclarativeComponentDefinition,
} from "../../shared/definition";
import { componentRootProps, componentStylePropsSchema } from "../../shared/component";

export const TIMELINE_SEMANTIC_TOKENS = ["past", "current", "upcoming", "blocked", "unknown"] as const;
export const TIMELINE_VARIANTS = ["standard", "compact", "minimal"] as const;
type TimelineVariant = typeof TIMELINE_VARIANTS[number];

const timelinePropsSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: ["items", "spec"],
  properties: {
    ...componentStylePropsSchema,
    items: { type: "array", items: { type: "object" } },
    variant: { enum: TIMELINE_VARIANTS },
    spec: {
      type: "object",
      additionalProperties: false,
      required: ["fields"],
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        emptyText: { type: "string" },
        fields: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "timestamp"],
          properties: {
            id: { type: "string", minLength: 1 },
            title: { type: "string", minLength: 1 },
            timestamp: { type: "string", minLength: 1 },
            detail: { type: "string", minLength: 1 },
            status: { type: "string", minLength: 1 },
          },
        },
        sort: {
          type: "object",
          additionalProperties: false,
          required: ["direction"],
          properties: { direction: { enum: ["ascending", "descending", "none"] } },
        },
        toneMap: {
          type: "object",
          additionalProperties: { enum: TIMELINE_SEMANTIC_TOKENS },
        },
      },
    },
  },
} as const;

type TimelineItem = Record<string, unknown>;
type TimelineFields = {
  id: string;
  title: string;
  timestamp: string;
  detail?: string;
  status?: string;
};

type TimelineSpec = {
  title?: string;
  description?: string;
  emptyText?: string;
  fields: TimelineFields;
  sort?: { direction: "ascending" | "descending" | "none" };
  toneMap?: Record<string, typeof TIMELINE_SEMANTIC_TOKENS[number]>;
};

const useStyles = makeStyles({
  root: { display: "grid", gap: tokens.spacingVerticalM },
  compactRoot: { gap: tokens.spacingVerticalS },
  minimalRoot: { gap: tokens.spacingVerticalXS },
  heading: { display: "grid", gap: tokens.spacingVerticalXXS },
  list: { display: "grid", gap: tokens.spacingVerticalS, margin: 0, padding: 0, listStyle: "none" },
  item: { display: "grid", gridTemplateColumns: "9rem minmax(0, 1fr)", gap: tokens.spacingHorizontalM },
  compactItem: { gridTemplateColumns: "6rem minmax(0, 1fr)", gap: tokens.spacingHorizontalS },
  minimalItem: { gridTemplateColumns: "5rem minmax(0, 1fr)", gap: tokens.spacingHorizontalXS },
  time: { color: tokens.colorNeutralForeground3, fontVariantNumeric: "tabular-nums" },
  content: { display: "grid", gap: tokens.spacingVerticalXXS },
  titleRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, flexWrap: "wrap" },
  detail: { color: tokens.colorNeutralForeground3 },
});

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function badgeColor(token: typeof TIMELINE_SEMANTIC_TOKENS[number]): "brand" | "danger" | "warning" | "success" | "informative" {
  if (token === "current") return "brand";
  if (token === "blocked") return "danger";
  if (token === "upcoming") return "warning";
  if (token === "past") return "success";
  return "informative";
}

function sortItems(items: TimelineItem[], fields: TimelineFields, direction: "ascending" | "descending" | "none"): TimelineItem[] {
  if (direction === "none") return items;
  const multiplier = direction === "descending" ? -1 : 1;
  return [...items].sort((left, right) => String(left[fields.timestamp] ?? "").localeCompare(String(right[fields.timestamp] ?? "")) * multiplier);
}

export const Timeline: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const items = Array.isArray(node.props.items) ? node.props.items.map(asObject) : [];
  const spec = asObject(node.props.spec) as TimelineSpec;
  const variant = (node.props.variant ?? "standard") as TimelineVariant;
  const fields = spec.fields;

  if (!fields || items.length === 0) {
    return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No timeline data."}</Text>;
  }

  const ordered = sortItems(items, fields, spec.sort?.direction ?? "ascending");
  return (
    <Card {...componentRootProps(node, mergeClasses(styles.root, variant === "compact" && styles.compactRoot, variant === "minimal" && styles.minimalRoot))} appearance="outline">
      {spec.title || spec.description ? (
        <CardHeader header={<div className={styles.heading}>{spec.title ? <Text weight="semibold" size={500}>{spec.title}</Text> : null}{spec.description ? <Text>{spec.description}</Text> : null}</div>} />
      ) : null}
      <ol className={styles.list}>
        {ordered.map((item, index) => {
          const id = String(item[fields.id] ?? index);
          const status = fields.status ? String(item[fields.status] ?? "") : "";
          const token = spec.toneMap?.[status];
          return (
            <li className={mergeClasses(styles.item, variant === "compact" && styles.compactItem, variant === "minimal" && styles.minimalItem)} key={id}>
              <time className={styles.time}><Text>{String(item[fields.timestamp] ?? "")}</Text></time>
              <div className={styles.content}>
                <div className={styles.titleRow}>
                  <Text weight="semibold">{String(item[fields.title] ?? "")}</Text>
                  {token && variant !== "minimal" ? <Badge appearance="tint" color={badgeColor(token)}>{status}</Badge> : null}
                </div>
                {variant !== "minimal" && fields.detail && item[fields.detail] != null ? <Text className={styles.detail}>{String(item[fields.detail])}</Text> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
};

const description: ComponentDescription = {
  capability: "semantic:timeline",
  summary: "Presents records whose primary relationship is chronological progression.",
  dataProp: "items",
  events: [],
  semanticTokens: TIMELINE_SEMANTIC_TOKENS,
  defaultVariant: "standard",
  variants: [
    { value: "standard", summary: "Full timeline spacing for primary chronological analysis.", useWhen: ["The timeline is a primary view", "Space is available for sustained reading"] },
    { value: "compact", summary: "Tighter chronology for constrained or supporting surfaces.", useWhen: ["The timeline appears in a sidebar or dense dashboard", "Users need to scan many nearby sections"] },
    { value: "minimal", summary: "Timestamp and title only for embedded chronological context.", useWhen: ["The timeline is an overview or navigation aid", "Details and statuses are available in another view"] },
  ],
  authoring: {
    useWhen: ["Records have meaningful timestamps", "Users need to inspect change or progression over time"],
    avoidWhen: ["Order is logical but not temporal; use sequence", "Relationships form a network; use semantic-graph"],
    rules: ["Bind records to items", "Map stable identity, title, and timestamp fields", "Choose only a declared variant", "Map domain statuses only to recognized timeline tokens"],
  },
};

export function describeTimeline(): ComponentDescription {
  return description;
}

export function getTimelineSchema(): Record<string, unknown> {
  return timelinePropsSchema as unknown as Record<string, unknown>;
}

export function validateTimeline(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([
    { kind: "ajv-schema", schema: getTimelineSchema(), message: "Invalid semantic:timeline props", code: "semantic-timeline-schema" },
    { kind: "jsonata", expr: "($field := data.spec.fields.id; $ids := data.items.$lookup($, $field); $count($ids) = $count($distinct($ids)))", message: "Timeline item identities must be unique", code: "semantic-timeline-unique-id" },
  ], props as Json);
}

export function materializeTimelineTrial() {
  return trialNode("semantic:timeline", {
    variant: "standard",
    items: [
      { eventKey: "evt-1", at: "09:10", title: "Signal detected", detail: "An anomalous sign-in was observed.", state: "resolved" },
      { eventKey: "evt-2", at: "09:24", title: "Investigation opened", detail: "The identity team began triage.", state: "active" },
    ],
    spec: {
      title: "Investigation timeline",
      description: "Ordered operational events",
      fields: { id: "eventKey", title: "title", timestamp: "at", detail: "detail", status: "state" },
      sort: { direction: "ascending" },
      toneMap: { resolved: "past", active: "current" },
    },
  });
}

export const timelineDefinition: DeclarativeComponentDefinition = {
  capability: description.capability,
  version: "1.1.0",
  summary: description.summary,
  dataProp: description.dataProp,
  events: description.events,
  semanticTokens: description.semanticTokens,
  defaultVariant: description.defaultVariant,
  variants: description.variants,
  authoring: description.authoring,
  component: Timeline,
  describe: describeTimeline,
  getSchema: getTimelineSchema,
  validate: validateTimeline,
  materializeTrial: materializeTimelineTrial,
};