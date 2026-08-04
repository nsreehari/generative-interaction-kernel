import React from "react";
import { Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import { defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";
import { asRecord, componentRootProps, componentStylePropsSchema, readPath, records, textAt } from "../../shared/component";
import {
  MAX_COORDINATE_TICKS,
  coordinateTickCountExceedsLimit,
  coordinateTicks,
  formatAxisCoordinate,
  formatCoordinate,
  parseCoordinate,
  type CoordinateScale,
} from "../../shared/coordinateScale";

export const GANTT_VARIANTS = ["standard", "compact"] as const;
export const MAX_GANTT_TICKS = MAX_COORDINATE_TICKS;
export type GanttScale = CoordinateScale;

export interface GanttSpec {
  title?: string;
  description?: string;
  emptyText?: string;
  scale?: GanttScale;
  fields: {
    id: string;
    label: string;
    start: string;
    end: string;
    detail?: string;
  };
}

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: ["items", "spec"],
  properties: {
    ...componentStylePropsSchema,
    items: { type: "array", items: { type: "object" } },
    variant: { enum: GANTT_VARIANTS },
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
          required: ["id", "label", "start", "end"],
          properties: {
            id: { type: "string", minLength: 1 },
            label: { type: "string", minLength: 1 },
            start: { type: "string", minLength: 1 },
            end: { type: "string", minLength: 1 },
            detail: { type: "string", minLength: 1 },
          },
        },
      },
    },
  },
} as const;

const useStyles = makeStyles({
  root: { display: "grid", gap: tokens.spacingVerticalM, minWidth: 0 },
  compactRoot: { gap: tokens.spacingVerticalS },
  header: { display: "grid", gap: tokens.spacingVerticalXXS },
  description: { color: tokens.colorNeutralForeground3 },
  rows: { display: "grid", gap: tokens.spacingVerticalS, minWidth: 0 },
  compactRows: { gap: tokens.spacingVerticalXS },
  row: { display: "grid", gridTemplateColumns: "minmax(10rem, 0.7fr) minmax(14rem, 1.3fr)", gap: tokens.spacingHorizontalM, alignItems: "center", "@media (max-width: 600px)": { gridTemplateColumns: "minmax(0, 1fr)", gap: tokens.spacingVerticalXS } },
  axisRow: { display: "grid", gridTemplateColumns: "minmax(10rem, 0.7fr) minmax(14rem, 1.3fr)", gap: tokens.spacingHorizontalM, "@media (max-width: 600px)": { gridTemplateColumns: "minmax(0, 1fr)" } },
  axisSpacer: { "@media (max-width: 600px)": { display: "none" } },
  axis: { position: "relative", height: "1.75rem", borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}` },
  tick: { position: "absolute", bottom: 0, height: "0.375rem", width: tokens.strokeWidthThin, backgroundColor: tokens.colorNeutralStroke1 },
  tickLabel: { position: "absolute", bottom: "0.5rem", color: tokens.colorNeutralForeground3, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", transform: "translateX(-50%)" },
  firstTickLabel: { transform: "none" },
  lastTickLabel: { transform: "translateX(-100%)" },
  label: { display: "grid", gap: tokens.spacingVerticalXXS, minWidth: 0 },
  detail: { color: tokens.colorNeutralForeground3 },
  time: { color: tokens.colorNeutralForeground3, fontVariantNumeric: "tabular-nums" },
  track: { position: "relative", height: "2rem", overflow: "hidden", borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3 },
  compactTrack: { height: "1.5rem" },
  bar: { position: "absolute", top: "0.25rem", bottom: "0.25rem", minWidth: "3px", borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorBrandBackground },
});

export function parseGanttCoordinate(value: unknown, scale: GanttScale): number {
  return parseCoordinate(value, scale);
}

export function formatGanttCoordinate(value: unknown, scale: GanttScale): string {
  return formatCoordinate(value, scale);
}

export function formatGanttAxisCoordinate(value: number, scale: GanttScale): string {
  return formatAxisCoordinate(value, scale);
}

export const Gantt: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const spec = node.props.spec as unknown as GanttSpec;
  const scale = spec.scale ?? { kind: "datetime" };
  const compact = node.props.variant === "compact";
  const intervals = records(node.props.items).map((item, index) => {
    const startValue = readPath(item, spec.fields?.start);
    const endValue = readPath(item, spec.fields?.end);
    return {
      id: textAt(item, spec.fields?.id) || String(index),
      label: textAt(item, spec.fields?.label),
      detail: textAt(item, spec.fields?.detail),
      startText: formatGanttCoordinate(startValue, scale),
      endText: formatGanttCoordinate(endValue, scale),
      start: parseGanttCoordinate(startValue, scale),
      end: parseGanttCoordinate(endValue, scale),
    };
  }).filter((interval) => interval.label && Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end >= interval.start);

  if (!spec.fields || intervals.length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No Gantt intervals available."}</Text>;
  const minimum = scale.kind === "linear" && scale.minimum !== undefined ? scale.minimum : Math.min(...intervals.map((interval) => interval.start));
  const maximum = scale.kind === "linear" && scale.maximum !== undefined ? scale.maximum : Math.max(...intervals.map((interval) => interval.end));
  const span = Math.max(1, maximum - minimum);
  const ticks = coordinateTicks(minimum, maximum, scale.tickStep);

  return <figure {...componentRootProps(node, mergeClasses(styles.root, compact && styles.compactRoot))} aria-label={spec.title ?? "Gantt chart"}>
    {spec.title || spec.description ? <figcaption className={styles.header}>{spec.title ? <Text weight="semibold" size={500}>{spec.title}</Text> : null}{spec.description ? <Text className={styles.description}>{spec.description}</Text> : null}</figcaption> : null}
    <div className={mergeClasses(styles.rows, compact && styles.compactRows)}>
      {ticks.length > 0 ? <div className={styles.axisRow} aria-label="Gantt scale"><div className={styles.axisSpacer} /><div className={styles.axis}>{ticks.map((tick, index) => {
        const left = ((tick - minimum) / span) * 100;
        return <React.Fragment key={tick}><span className={styles.tick} style={{ left: `${left}%` }} aria-hidden="true" /><Text className={mergeClasses(styles.tickLabel, index === 0 && styles.firstTickLabel, index === ticks.length - 1 && styles.lastTickLabel)} size={200} style={{ left: `${left}%` }}>{formatGanttAxisCoordinate(tick, scale)}</Text></React.Fragment>;
      })}</div></div> : null}
      {intervals.map((interval) => {
      const left = ((interval.start - minimum) / span) * 100;
      const width = (Math.max(0, interval.end - interval.start) / span) * 100;
      return <div className={styles.row} key={interval.id}>
        <div className={styles.label}><Text weight="semibold">{interval.label}</Text>{!compact && interval.detail ? <Text className={styles.detail} size={200}>{interval.detail}</Text> : null}<Text className={styles.time} size={200}>{interval.startText} - {interval.endText}</Text></div>
        <div className={mergeClasses(styles.track, compact && styles.compactTrack)} aria-hidden="true"><div className={styles.bar} style={{ left: `${left}%`, width: `${Math.min(100 - left, Math.max(0.5, width))}%` }} /></div>
      </div>;
    })}</div>
  </figure>;
};

const description: ComponentDescription = {
  capability: "primitive:gantt",
  summary: "Renders mapped intervals on a shared datetime or linear coordinate scale.",
  dataProp: "items",
  events: [],
  semanticTokens: [],
  defaultVariant: "standard",
  variants: [
    { value: "standard", summary: "Full labels, details, timestamps, and interval tracks.", useWhen: ["The Gantt is a primary temporal comparison", "Interval context should remain visible"] },
    { value: "compact", summary: "Reduced-height tracks and labels without details.", useWhen: ["The Gantt is embedded in a dense supporting surface", "Users primarily compare timing and duration"] },
  ],
  authoring: {
    useWhen: ["Records have meaningful start and end coordinates", "Users need to compare duration, span, or overlap"],
    avoidWhen: ["Records are point events; use semantic:event-series", "Order is non-temporal; use semantic:process"],
    rules: ["Provide unique stable ids", "Use datetime for actual timestamps and numeric linear coordinates for logical order or progress", "Use displayPrefix only to format linear coordinates, such as showing 1 as T1", "Set a positive tickStep in milliseconds for datetime or coordinate units for linear when the scale should show shared column markers", "Ensure each end is not earlier than its start", "Use one consistent scale across all intervals"],
  },
};

export function getGanttSchema(): Record<string, unknown> { return schema as unknown as Record<string, unknown>; }
export function describeGantt(): ComponentDescription { return description; }
export function validateGantt(props: unknown): ComponentValidationReport {
  const report = runDeclarativeValidators([
    { kind: "ajv-schema", schema: getGanttSchema(), message: "Invalid primitive:gantt props", code: "primitive-gantt-schema" },
    { kind: "jsonata", expr: "($field := data.spec.fields.id; $ids := data.items.$lookup($, $field); $count($ids) = $count($distinct($ids)))", message: "Gantt item ids must be unique", code: "gantt-unique-item-id" },
  ], props as Json);
  if (!report.ok) return report;
  const propsRecord = asRecord(props);
  const spec = asRecord(propsRecord.spec);
  const fields = asRecord(spec.fields);
  const scaleRecord = asRecord(spec.scale);
  const scale: GanttScale = scaleRecord.kind === "linear"
    ? { kind: "linear", displayPrefix: typeof scaleRecord.displayPrefix === "string" ? scaleRecord.displayPrefix : undefined, minimum: typeof scaleRecord.minimum === "number" ? scaleRecord.minimum : undefined, maximum: typeof scaleRecord.maximum === "number" ? scaleRecord.maximum : undefined, tickStep: typeof scaleRecord.tickStep === "number" ? scaleRecord.tickStep : undefined }
    : { kind: "datetime", hourFormat: scaleRecord.hourFormat === "12" ? "12" : "24", tickStep: typeof scaleRecord.tickStep === "number" ? scaleRecord.tickStep : undefined, showSeconds: scaleRecord.showSeconds === true, showTimeZone: scaleRecord.showTimeZone === true };
  const minimum = scale.kind === "linear" ? scale.minimum : undefined;
  const maximum = scale.kind === "linear" ? scale.maximum : undefined;
  const invalidDomain = minimum !== undefined && maximum !== undefined && maximum <= minimum;
  const parsedIntervals = records(propsRecord.items).map((item) => ({
    start: parseGanttCoordinate(readPath(item, String(fields.start)), scale),
    end: parseGanttCoordinate(readPath(item, String(fields.end)), scale),
  }));
  const domainMinimum = minimum ?? Math.min(...parsedIntervals.map((interval) => interval.start));
  const domainMaximum = maximum ?? Math.max(...parsedIntervals.map((interval) => interval.end));
  const invalidTickCount = coordinateTickCountExceedsLimit(domainMinimum, domainMaximum, scale.tickStep);
  const invalidInterval = parsedIntervals.some(({ start, end }) => {
    return !Number.isFinite(start) || !Number.isFinite(end) || end < start
      || (minimum !== undefined && start < minimum)
      || (maximum !== undefined && end > maximum);
  });
  if (invalidDomain || invalidTickCount || invalidInterval) {
    report.ok = false;
    report.errors.push({ detail: "Gantt intervals must be valid, ordered coordinates within the configured scale bounds", code: "gantt-valid-interval" });
  }
  return report;
}
export function materializeGanttTrial() {
  return trialNode("primitive:gantt", {
    variant: "standard",
    items: [
      { id: "initial-access", label: "Initial access", detail: "Threat actor authenticated as admin", start: "2026-07-17T23:09:23Z", end: "2026-07-17T23:09:27Z" },
      { id: "collection", label: "Mailbox collection", detail: "Admin identity accessed finance mailbox", start: "2026-07-17T23:09:25Z", end: "2026-07-17T23:09:34Z" },
    ],
    spec: { title: "Attack activity", description: "Observed relationship intervals", fields: { id: "id", label: "label", detail: "detail", start: "start", end: "end" } },
  });
}
export const ganttDefinition = defineComponent({ description, version: "1.4.0", component: Gantt, getSchema: getGanttSchema, validate: validateGantt, materializeTrial: materializeGanttTrial });