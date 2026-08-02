import type React from "react";
import { mergeClasses, type BadgeProps } from "@fluentui/react-components";
import type { ResolvedNode } from "@gik/kernel";

export type DataRecord = Record<string, unknown>;
export type BadgeColor = NonNullable<BadgeProps["color"]>;

export const componentStylePropsSchema = {
  className: { type: "string" },
  style: {
    type: "object",
    additionalProperties: { type: ["string", "number"] },
  },
} as const;

export function withComponentStylePropsSchema<T extends { properties?: Record<string, unknown> }>(schema: T): T {
  return {
    ...schema,
    properties: { ...schema.properties, ...componentStylePropsSchema },
  };
}

export function componentRootProps(node: ResolvedNode, ...classNames: Array<string | undefined | false>): {
  className: string | undefined;
  style: React.CSSProperties | undefined;
} {
  const callsiteClassName = typeof node.props.className === "string" ? node.props.className : undefined;
  const style = node.props.style && typeof node.props.style === "object" && !Array.isArray(node.props.style)
    ? node.props.style as React.CSSProperties
    : undefined;
  return {
    className: mergeClasses(...classNames, callsiteClassName) || undefined,
    style,
  };
}

export function asRecord(value: unknown): DataRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DataRecord : {};
}

export function records(value: unknown): DataRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export function readPath(record: DataRecord, path: string | undefined): unknown {
  if (!path) return undefined;
  return path.split(".").reduce<unknown>((value, segment) => asRecord(value)[segment], record);
}

export function textAt(record: DataRecord, path: string | undefined): string {
  const value = readPath(record, path);
  return value == null ? "" : String(value);
}