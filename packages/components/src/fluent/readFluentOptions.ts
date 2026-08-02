import type { Json } from "@gik/kernel";

export interface FluentOptionValue {
  value: string;
  label: string;
  disabled?: boolean;
}

export const fluentOptionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["value", "label"],
  properties: {
    value: { type: "string" },
    label: { type: "string" },
    disabled: { type: "boolean" },
  },
} as const;

export function readFluentOptions(value: Json | undefined): FluentOptionValue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    if (typeof item.value !== "string" || typeof item.label !== "string") return [];
    return [{ value: item.value, label: item.label, disabled: item.disabled === true }];
  });
}
