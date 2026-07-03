// React binding: subscribes to a GenUIController and renders its resolved tree.

import { useEffect, useState, type ReactNode } from "react";
import type { ResolvedNode } from "../../../kernel/src/types";
import { GenUIController } from "./controller";
import { renderNode } from "./render";
import type { ComponentRegistry } from "./registry";

export function useGenUI(controller: GenUIController): {
  tree: ResolvedNode | null;
  emit: (node: string, name: string, payload?: Record<string, unknown>) => void;
} {
  const [tree, setTree] = useState<ResolvedNode | null>(() => controller.getTree());

  useEffect(() => {
    const unsubscribe = controller.subscribe(setTree);
    void controller.start();
    return unsubscribe;
  }, [controller]);

  const emit = (node: string, name: string, payload?: Record<string, unknown>) => {
    void controller.emit(node, name, payload);
  };

  return { tree, emit };
}

export function GenUIRoot({
  controller,
  registry,
}: {
  controller: GenUIController;
  registry: ComponentRegistry;
}): ReactNode {
  const { tree, emit } = useGenUI(controller);
  if (!tree) return null;
  return renderNode(tree, registry, emit);
}
