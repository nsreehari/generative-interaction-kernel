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

import type { ComponentValidationReport } from "../../shared/definition";
import { componentRootProps, componentStylePropsSchema, readPath } from "../../shared/component";
import {
  MAX_COORDINATE_TICKS,
  formatAxisCoordinate,
  formatCoordinate,
  parseCoordinate,
  type CoordinateScale,
} from "../../shared/coordinateScale";

const MAX_TIMELINE_TICKS = MAX_COORDINATE_TICKS;

export const TIMELINE_SEMANTIC_TOKENS = ["past", "current", "upcoming", "blocked", "unknown"] as const;
export const TIMELINE_VARIANTS = ["standard", "compact", "minimal", "axis"] as const;
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
        scale: {
          type: "object",
          additionalProperties: false,
          required: ["kind"],
          properties: {
            kind: { enum: ["datetime", "linear"] },
            hourFormat: { enum: ["24", "12"] },
            displayPrefix: { type: "string" },
            minimum: { type: "number" },
            maximum: { type: "number" },
            tickStep: { type: "number", exclusiveMinimum: 0 },
            showSeconds: { type: "boolean" },
            showTimeZone: { type: "boolean" },
          },
        },
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
  scale?: CoordinateScale;
  fields: TimelineFields;
  sort?: { direction: "ascending" | "descending" | "none" };
  toneMap?: Record<string, typeof TIMELINE_SEMANTIC_TOKENS[number]>;
};

const useStyles = makeStyles({
  root: { display: "grid", gap: tokens.spacingVerticalM, minWidth: 0, maxWidth: "100%" },
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
  axisViewport: { width: "100%", minWidth: 0, maxWidth: "100%", overflowX: "auto", overflowY: "hidden", contain: "layout paint", paddingBlock: tokens.spacingVerticalXS },
  axis: { position: "relative", height: "11rem", minWidth: "42rem", marginInline: tokens.spacingHorizontalM },
  axisLine: { position: "absolute", top: "5.5rem", left: 0, right: 0, height: tokens.strokeWidthThick, backgroundColor: tokens.colorNeutralStroke1 },
  axisTick: { position: "absolute", top: "5.25rem", width: tokens.strokeWidthThin, height: "0.75rem", backgroundColor: tokens.colorNeutralStroke1 },
  axisTickLabel: { position: "absolute", top: "6.25rem", color: tokens.colorNeutralForeground3, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", transform: "translateX(-50%)" },
  axisEvent: { position: "absolute", top: 0, bottom: 0, width: "1px" },
  axisMarker: { position: "absolute", top: "5rem", left: "-0.375rem", width: "0.75rem", height: "0.75rem", borderRadius: tokens.borderRadiusCircular, border: `${tokens.strokeWidthThick} solid ${tokens.colorNeutralBackground1}`, backgroundColor: tokens.colorBrandBackground },
  axisStemAbove: { position: "absolute", top: "3.75rem", left: 0, width: tokens.strokeWidthThin, height: "1.25rem", backgroundColor: tokens.colorNeutralStroke1 },
  axisStemBelow: { position: "absolute", top: "5.75rem", left: 0, width: tokens.strokeWidthThin, height: "1.25rem", backgroundColor: tokens.colorNeutralStroke1 },
  axisLabel: { position: "absolute", left: 0, width: "9rem", display: "grid", gap: tokens.spacingVerticalXXS, transform: "translateX(-50%)", textAlign: "center" },
  axisFirstLabel: { transform: "none", textAlign: "left" },
  axisLastLabel: { transform: "translateX(-100%)", textAlign: "right" },
  axisLabelAbove: { bottom: "7.25rem" },
  axisLabelBelow: { top: "7.25rem" },
  axisTime: { color: tokens.colorNeutralForeground3, fontVariantNumeric: "tabular-nums" },
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

function sortItems(items: TimelineItem[], fields: TimelineFields, direction: "ascending" | "descending" | "none", scale?: CoordinateScale): TimelineItem[] {
  if (direction === "none") return items;
  const multiplier = direction === "descending" ? -1 : 1;
  if (scale) return [...items].sort((left, right) => (parseCoordinate(readPath(left, fields.timestamp), scale) - parseCoordinate(readPath(right, fields.timestamp), scale)) * multiplier);
  return [...items].sort((left, right) => String(left[fields.timestamp] ?? "").localeCompare(String(right[fields.timestamp] ?? "")) * multiplier);
}

function renderAxisTimeline(items: TimelineItem[], spec: TimelineSpec, styles: ReturnType<typeof useStyles>) {
  const scale = spec.scale ?? { kind: "datetime" };
  const events = items.map((item, index) => {
    const rawCoordinate = readPath(item, spec.fields.timestamp);
    return { id: String(readPath(item, spec.fields.id) ?? index), title: String(readPath(item, spec.fields.title) ?? ""), coordinate: parseCoordinate(rawCoordinate, scale), coordinateText: formatCoordinate(rawCoordinate, scale) };
  }).filter((event) => event.title && Number.isFinite(event.coordinate));
  if (events.length === 0) return <Text>{spec.emptyText ?? "No timeline data."}</Text>;
  const minimum = scale.kind === "linear" && scale.minimum !== undefined ? scale.minimum : Math.min(...events.map((event) => event.coordinate));
  const maximum = scale.kind === "linear" && scale.maximum !== undefined ? scale.maximum : Math.max(...events.map((event) => event.coordinate));
  const span = Math.max(1, maximum - minimum);
  const tickStep = scale.tickStep;
  const ticks = tickStep ? Array.from({ length: Math.min(MAX_TIMELINE_TICKS, Math.floor(span / tickStep) + 1) }, (_, index) => minimum + index * tickStep).filter((value) => value <= maximum) : [];
  return <div className={styles.axisViewport}><div className={styles.axis} role="group" aria-label={spec.title ?? "Timeline axis"}><div className={styles.axisLine} aria-hidden="true" />
    {ticks.map((tick) => { const left = ((tick - minimum) / span) * 100; return <React.Fragment key={tick}><span className={styles.axisTick} style={{ left: `${left}%` }} aria-hidden="true" /><Text className={styles.axisTickLabel} size={200} style={{ left: `${left}%` }}>{formatAxisCoordinate(tick, scale)}</Text></React.Fragment>; })}
    {events.map((event, index) => { const left = ((event.coordinate - minimum) / span) * 100; const above = index % 2 === 0; return <div className={styles.axisEvent} style={{ left: `${left}%` }} key={event.id}><span className={above ? styles.axisStemAbove : styles.axisStemBelow} aria-hidden="true" /><span className={styles.axisMarker} aria-hidden="true" /><div className={mergeClasses(styles.axisLabel, above ? styles.axisLabelAbove : styles.axisLabelBelow, event.coordinate === minimum && styles.axisFirstLabel, event.coordinate === maximum && styles.axisLastLabel)}><Text weight="semibold">{event.title}</Text><Text className={styles.axisTime} size={200}>{event.coordinateText}</Text></div></div>; })}
  </div></div>;
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

  const ordered = sortItems(items, fields, spec.sort?.direction ?? "ascending", variant === "axis" ? spec.scale ?? { kind: "datetime" } : undefined);
  return (
    <Card {...componentRootProps(node, mergeClasses(styles.root, variant === "compact" && styles.compactRoot, variant === "minimal" && styles.minimalRoot))} appearance="outline">
      {spec.title || spec.description ? (
        <CardHeader header={<div className={styles.heading}>{spec.title ? <Text weight="semibold" size={500}>{spec.title}</Text> : null}{spec.description ? <Text>{spec.description}</Text> : null}</div>} />
      ) : null}
      {variant === "axis" ? null : <ol className={styles.list}>
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
      </ol>}
      {variant === "axis" ? renderAxisTimeline(ordered, spec, styles) : null}
    </Card>
  );
};

export function getTimelineSchema(): Record<string, unknown> {
  return timelinePropsSchema as unknown as Record<string, unknown>;
}

export function validateTimeline(props: unknown): ComponentValidationReport {
  const report = runDeclarativeValidators([
    { kind: "ajv-schema", schema: getTimelineSchema(), message: "Invalid timeline renderer props", code: "timeline-schema" },
    { kind: "jsonata", expr: "($field := data.spec.fields.id; $ids := data.items.$lookup($, $field); $count($ids) = $count($distinct($ids)))", message: "Timeline item identities must be unique", code: "timeline-unique-id" },
  ], props as Json);
  if (!report.ok) return report;
  const value = asObject(props);
  if (value.variant !== "axis") return report;
  const spec = asObject(value.spec) as TimelineSpec;
  const scale = spec.scale ?? { kind: "datetime" };
  const coordinates = (Array.isArray(value.items) ? value.items.map(asObject) : []).map((item) => parseCoordinate(readPath(item, spec.fields.timestamp), scale));
  const minimum = scale.kind === "linear" ? scale.minimum : undefined;
  const maximum = scale.kind === "linear" ? scale.maximum : undefined;
  const domainMinimum = minimum ?? Math.min(...coordinates);
  const domainMaximum = maximum ?? Math.max(...coordinates);
  const invalid = coordinates.some((coordinate) => !Number.isFinite(coordinate) || (minimum !== undefined && coordinate < minimum) || (maximum !== undefined && coordinate > maximum));
  const invalidDomain = minimum !== undefined && maximum !== undefined && maximum <= minimum;
  const invalidTickCount = scale.tickStep !== undefined && Math.floor((domainMaximum - domainMinimum) / scale.tickStep) + 1 > MAX_TIMELINE_TICKS;
  if (invalid || invalidDomain || invalidTickCount) { report.ok = false; report.errors.push({ detail: "Axis timeline events must use valid coordinates within the configured scale bounds", code: "timeline-valid-coordinate" }); }
  return report;
}