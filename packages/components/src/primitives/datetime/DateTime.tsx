import React from "react";
import { Text } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import { componentRootProps, componentStylePropsSchema } from "../../shared/component";
import { defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";

export const DATETIME_VARIANTS = ["date", "time", "timestamp"] as const;
export type DateTimeVariant = typeof DATETIME_VARIANTS[number];

export interface DateTimeFormatOptions {
  hourFormat?: "24" | "12";
  locale?: Intl.LocalesArgument;
  now?: Date;
  showSeconds?: boolean;
  showTimeZone?: boolean;
}

function timeOptions({ hourFormat = "24", showSeconds = false, showTimeZone = false }: DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  return {
    hour: "numeric",
    minute: "2-digit",
    ...(showSeconds ? { second: "2-digit" as const } : {}),
    ...(showTimeZone ? { timeZoneName: "short" as const } : {}),
    hourCycle: hourFormat === "12" ? "h12" : "h23",
  };
}

function dateOptions(date: Date, now: Date): Intl.DateTimeFormatOptions {
  return {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" as const }),
  };
}

export function formatDateTime(value: string | number | Date, variant: DateTimeVariant, options: DateTimeFormatOptions = {}): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  const now = options.now ?? new Date();
  if (variant === "date") return new Intl.DateTimeFormat(options.locale, dateOptions(date, now)).format(date);
  if (variant === "time") return new Intl.DateTimeFormat(options.locale, timeOptions(options)).format(date);
  return new Intl.DateTimeFormat(options.locale, { ...dateOptions(date, now), ...timeOptions(options) }).format(date);
}

export function formatDate(value: string | number | Date, options?: DateTimeFormatOptions): string { return formatDateTime(value, "date", options); }
export function formatTime(value: string | number | Date, options?: DateTimeFormatOptions): string { return formatDateTime(value, "time", options); }
export function formatTimestamp(value: string | number | Date, options?: DateTimeFormatOptions): string { return formatDateTime(value, "timestamp", options); }

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: ["value"],
  properties: {
    ...componentStylePropsSchema,
    value: { type: ["string", "number"] },
    variant: { enum: DATETIME_VARIANTS },
    hourFormat: { enum: ["24", "12"] },
    showSeconds: { type: "boolean" },
    showTimeZone: { type: "boolean" },
  },
} as const;

export const DateTime: ProjectionView = ({ node }) => {
  const variant = (node.props.variant ?? "timestamp") as DateTimeVariant;
  const rawValue = node.props.value as string | number;
  return <time dateTime={new Date(rawValue).toISOString()} {...componentRootProps(node)}><Text>{formatDateTime(rawValue, variant, { hourFormat: node.props.hourFormat === "12" ? "12" : "24", showSeconds: node.props.showSeconds === true, showTimeZone: node.props.showTimeZone === true })}</Text></time>;
};

const description: ComponentDescription = {
  capability: "primitive:datetime",
  summary: "Formats a date, time, or timestamp for the browser's locale and local timezone.",
  dataProp: "value",
  events: [],
  semanticTokens: [],
  defaultVariant: "timestamp",
  variants: [
    { value: "date", summary: "Calendar date without a clock time.", useWhen: ["The day matters but time-of-day does not"] },
    { value: "time", summary: "Localized clock time without a timezone suffix.", useWhen: ["The date is already established by surrounding context"] },
    { value: "timestamp", summary: "Localized calendar date and clock time.", useWhen: ["Users need the date and local time of an event"] },
  ],
  authoring: {
    useWhen: ["A scalar temporal value needs consistent human-readable presentation", "Semantic HTML time metadata should preserve the source instant"],
    avoidWhen: ["Users must edit the value; use primitive:form", "Multiple temporal records form a chronology; use semantic:timeline"],
    rules: ["Provide a parseable ISO timestamp or epoch value", "Choose date, time, or timestamp according to the surrounding semantic context", "Time uses 24-hour format by default; set hourFormat to 12 for locale-appropriate AM/PM output", "Time and timestamp omit seconds by default; set showSeconds when second-level precision is meaningful", "Formatting follows the browser locale and local timezone; set showTimeZone only when the timezone label is useful"],
  },
};

export function getDateTimeSchema(): Record<string, unknown> { return schema as unknown as Record<string, unknown>; }
export function validateDateTime(props: unknown): ComponentValidationReport {
  const report = runDeclarativeValidators([
    { kind: "ajv-schema", schema: getDateTimeSchema(), message: "Invalid primitive:datetime props", code: "primitive-datetime-schema" },
  ], props as Json);
  if (!report.ok) return report;
  const value = (props as { value: string | number }).value;
  if (!Number.isFinite(new Date(value).getTime())) {
    report.ok = false;
    report.errors.push({ detail: "DateTime value must be a parseable timestamp", code: "datetime-parseable-value" });
  }
  return report;
}
export function materializeDateTimeTrial() {
  return trialNode("primitive:datetime", { value: "2026-07-17T23:09:23Z", variant: "timestamp" });
}
export const dateTimeDefinition = defineComponent({ description, version: "1.1.0", component: DateTime, getSchema: getDateTimeSchema, validate: validateDateTime, materializeTrial: materializeDateTimeTrial });
