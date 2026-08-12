import type { ReactNode } from "react";

export interface LayoutSlotAssignment {
  key: string;
  slot: string;
}

export interface LayoutSpec {
  slots?: readonly LayoutSlotAssignment[];
}

export interface SlottableItem<T = ReactNode> {
  key: string;
  content: T;
}

export interface ResolvedLayoutSlots<T = ReactNode> {
  children: T[];
  slots: Readonly<Record<string, T[]>>;
}

function slotAssignments(layout: unknown): Map<string, string> {
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) return new Map();
  const slots = (layout as { slots?: unknown }).slots;
  if (!Array.isArray(slots)) return new Map();

  return new Map(slots.flatMap((assignment) => {
    if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) return [];
    const { key, slot } = assignment as { key?: unknown; slot?: unknown };
    return typeof key === "string" && typeof slot === "string" ? [[key, slot] as const] : [];
  }));
}

export function resolveLayoutSlots<T>(items: readonly SlottableItem<T>[], layout?: unknown): ResolvedLayoutSlots<T> {
  const assignments = slotAssignments(layout);
  const children: T[] = [];
  const slots: Record<string, T[]> = {};

  for (const item of items) {
    const slot = assignments.get(item.key);
    if (!slot || slot === "children") {
      children.push(item.content);
      continue;
    }
    (slots[slot] ??= []).push(item.content);
  }

  return { children, slots };
}