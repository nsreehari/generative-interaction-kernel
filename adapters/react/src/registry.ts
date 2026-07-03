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
