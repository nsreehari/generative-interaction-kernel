// Maps a capability id to a React component, with a graceful fallback.
// This is the RenderAdapter's vocabulary side: which component draws each capability.

import type { ComponentType, ReactNode } from "react";
import type { ResolvedNode } from "../../../kernel/src/types";

export interface CapabilityViewProps {
  node: ResolvedNode;
  /** Emit a behavior event for this node (node id is already bound). */
  emit: (name: string, payload?: Record<string, unknown>) => void;
  children: ReactNode;
}

export type CapabilityView = ComponentType<CapabilityViewProps>;

export interface ComponentRegistry {
  get(capability: string): CapabilityView | undefined;
  readonly fallback: CapabilityView;
}

export function createRegistry(
  map: Record<string, CapabilityView>,
  fallback: CapabilityView
): ComponentRegistry {
  return {
    get: (capability) => map[capability],
    fallback,
  };
}

/**
 * Layer a bundle's EXTRA capabilities on top of a frozen base (the shared floor). The floor stays
 * the single source of the universal vocabulary; a bundle ships only its deltas. Extras win on key
 * collision (so an app may specialize a floor control), and the base fills in everything else.
 */
export function overlayRegistry(
  base: ComponentRegistry,
  extra: Record<string, CapabilityView>
): ComponentRegistry {
  return {
    get: (capability) => extra[capability] ?? base.get(capability),
    fallback: base.fallback,
  };
}
