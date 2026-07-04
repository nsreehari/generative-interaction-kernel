// React binding: subscribes to any GenUI source (the in-process GenUIController or
// the transport-backed GenUIClient) and renders its resolved tree.

import { useEffect, useState, type ReactNode } from "react";
import type { ResolvedNode } from "../../../kernel/src/types";
import { renderNode } from "./render";
import type { ComponentRegistry } from "./registry";

/**
 * The minimal surface the React binding needs. Both `GenUIController` (in-process)
 * and `GenUIClient` (over a transport) satisfy this structurally, so the same
 * components render whether the kernel is local or across the wire.
 */
export interface GenUISource {
  getTree(): ResolvedNode | null;
  subscribe(listener: () => void): () => void;
  emit(node: string, name: string, payload?: Record<string, unknown>): void | Promise<unknown>;
  start(): void | Promise<unknown>;
}

export function useGenUI(source: GenUISource): {
  tree: ResolvedNode | null;
  emit: (node: string, name: string, payload?: Record<string, unknown>) => void;
} {
  const [tree, setTree] = useState<ResolvedNode | null>(() => source.getTree());

  useEffect(() => {
    const unsubscribe = source.subscribe(() => setTree(source.getTree()));
    void source.start();
    return unsubscribe;
  }, [source]);

  const emit = (node: string, name: string, payload?: Record<string, unknown>) => {
    void source.emit(node, name, payload);
  };

  return { tree, emit };
}

export function GenUIRoot({
  source,
  registry,
}: {
  source: GenUISource;
  registry: ComponentRegistry;
}): ReactNode {
  const { tree, emit } = useGenUI(source);
  if (!tree) return null;
  return renderNode(tree, registry, emit);
}
