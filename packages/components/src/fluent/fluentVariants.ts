import type { ComponentVariantDescription } from "../shared/definition";

export const STANDARD_COMPACT_VARIANTS: readonly ComponentVariantDescription[] = [
  {
    value: "standard",
    summary: "Uses Fluent's standard control sizing.",
    useWhen: ["The control appears in a normal form, panel, or command surface"],
  },
  {
    value: "compact",
    summary: "Uses Fluent's native small control sizing.",
    useWhen: ["The control appears in a dense toolbar, table, or constrained surface"],
  },
];

export const FLUENT_CONTROL_SIZES = ["small", "medium", "large"] as const;
export type FluentControlSize = typeof FLUENT_CONTROL_SIZES[number];

export function resolveControlSize(size: string, variant: unknown): FluentControlSize | undefined {
  if (size === "small" || size === "medium" || size === "large") return size;
  return variant === "compact" ? "small" : undefined;
}
