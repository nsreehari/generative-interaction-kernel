// Pure renderer: a ResolvedNode tree -> React elements.
// Honors `visible` (invisible nodes render nothing) and `fallback` (kernel-unknown
// capability, or a capability with no registered component, uses the fallback view).

import { createElement, type ReactNode } from "react";
import type { ResolvedNode } from "gik-kernel";
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

  const children = node.children.map((child) => renderNode(child, registry, emit));
  const boundEmit = (name: string, payload?: Record<string, unknown>, actorId?: string) =>
    emit(node.id, name, payload, actorId);

  return createElement(View, {
    key: node.id,
    node,
    emit: boundEmit,
    children,
  });
}
