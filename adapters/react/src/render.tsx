// Pure renderer: a ResolvedNode tree -> React elements.
// Honors `visible` (invisible nodes render nothing) and `fallback` (kernel-unknown
// capability, or a capability with no registered component, uses the fallback view).

import { createElement, type ReactNode } from "react";
import type { ResolvedNode } from "@gik/kernel";
import { resolveLayoutSlots } from "./layout";
import type { ComponentRegistry } from "./registry";

export type EmitFn = (
  nodeId: string,
  name: string,
  payload?: Record<string, unknown>,
  actorId?: string
) => void | Promise<unknown>;

export function renderNode(
  node: ResolvedNode,
  registry: ComponentRegistry,
  emit: EmitFn
): ReactNode {
  if (!node.visible) return null;

  const View = registry.getStructural?.(node.capability)
    ?? (node.fallback ? undefined : registry.get(node.capability))
    ?? registry.fallback;

  const layout = resolveLayoutSlots(
    node.children.map((child) => ({ key: child.id, content: renderNode(child, registry, emit) })),
    node.props.layout,
  );
  const boundEmit = (name: string, payload?: Record<string, unknown>, actorId?: string) =>
    emit(node.id, name, payload, actorId);

  return createElement(View, {
    key: node.id,
    node,
    emit: boundEmit,
    children: layout.children,
    slots: layout.slots,
  });
}
