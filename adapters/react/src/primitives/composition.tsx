// SharedCompositionElement — the React side of a SharedComposition (providers/shared-composition).
//
// A SharedComposition is ONE kernel whose document has several child regions over a single shared
// store (chrome, inspect, …). This element drives that one controller and hands each region down
// through context; a `SharedCompositionRegion` then renders any subtree by id — so the caller lays the
// regions out wherever it likes (three columns, tabs, panes) while they all read/write the SAME store.
//
// It is deliberately just a normal React element, not a top-level "host": it can sit anywhere in a
// React tree, including as a node inside a larger app, and can itself be nested. Bring a built
// `composition` (it owns the controller lifecycle) or, for tests/advanced cases, inject a resolved
// tree directly via `SharedCompositionProvider`.

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { Kernel } from "../../../../kernel/src/kernel";
import type { ResolvedNode } from "../../../../kernel/src/types";
import { GenUIController } from "../controller";
import { useGenUI } from "../useGenUI";
import { renderNode, type EmitFn } from "../render";
import type { ComponentRegistry } from "../registry";

/**
 * The minimal shape this element needs from a SharedComposition controller (structurally satisfied by
 * `SharedComposition` from providers/shared-composition — kept structural so the adapter takes no
 * dependency on the providers package).
 */
export interface CompositionController {
  readonly children: readonly string[];
  readonly kernel: Kernel;
  /** Await the reactive `computed` cascade to quiesce (no-op for a plain store). */
  settle(): Promise<void>;
  /** Release the store's resources when the composition unmounts. */
  dispose(): Promise<void>;
}

interface SharedCompositionContextValue {
  tree: ResolvedNode | null;
  emit: EmitFn;
  registry: ComponentRegistry;
}

const SharedCompositionContext = createContext<SharedCompositionContextValue | null>(null);

/** Read the current shared composition context (the live tree, the shared emit, and the registry). */
export function useSharedComposition(): SharedCompositionContextValue {
  const ctx = useContext(SharedCompositionContext);
  if (!ctx) {
    throw new Error(
      "useSharedComposition must be used within a <SharedCompositionElement> or <SharedCompositionProvider>"
    );
  }
  return ctx;
}

export interface SharedCompositionElementProps {
  /** The built composition controller (from `createSharedComposition`). The element owns its lifecycle. */
  composition: CompositionController;
  /** How resolved nodes become React components for every region. */
  registry: ComponentRegistry;
  /** Region placements (e.g. `<SharedCompositionRegion rootId="chrome" />`) and any surrounding chrome. */
  children?: ReactNode;
}

/**
 * Drive one SharedComposition: build a single controller over its shared kernel (settling the reactive
 * `computed` store before each resolve), subscribe once, and provide the live tree + shared emit to the
 * regions nested beneath it. Disposes the composition on unmount.
 */
export function SharedCompositionElement({
  composition,
  registry,
  children,
}: SharedCompositionElementProps): ReactNode {
  const source = useMemo(
    () => new GenUIController(composition.kernel, () => composition.settle()),
    [composition]
  );
  useEffect(() => {
    return () => {
      void composition.dispose();
    };
  }, [composition]);

  const { tree, emit } = useGenUI(source);
  return createElement(
    SharedCompositionContext.Provider,
    { value: { tree, emit, registry } },
    children
  );
}

/**
 * The raw context provider — inject an already-resolved tree + emit + registry directly. Useful for
 * tests and for hosts that own the controller loop themselves.
 */
export function SharedCompositionProvider({
  value,
  children,
}: {
  value: SharedCompositionContextValue;
  children?: ReactNode;
}): ReactNode {
  return createElement(SharedCompositionContext.Provider, { value }, children);
}

export interface SharedCompositionRegionProps {
  /** The node id of the region subtree to render (a child role of the composition). */
  rootId: string;
  /** Optional registry override; defaults to the composition's registry. */
  registry?: ComponentRegistry;
}

/**
 * Render one region of the shared composition: the subtree rooted at `rootId`, over the ONE shared
 * controller. Multiple regions placed anywhere in the layout all read and write the same store.
 */
export function SharedCompositionRegion({ rootId, registry }: SharedCompositionRegionProps): ReactNode {
  const { tree, emit, registry: contextRegistry } = useSharedComposition();
  const region = tree ? findById(tree, rootId) : undefined;
  if (!region) return null;
  return renderNode(region, registry ?? contextRegistry, emit);
}

function findById(node: ResolvedNode, id: string): ResolvedNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const hit = findById(child, id);
    if (hit) return hit;
  }
  return undefined;
}
