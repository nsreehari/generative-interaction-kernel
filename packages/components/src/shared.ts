import type { BadgeProps } from "@fluentui/react-components";

export type DataRecord = Record<string, unknown>;
export type BadgeColor = NonNullable<BadgeProps["color"]>;

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