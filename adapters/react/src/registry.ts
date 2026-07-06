// Maps a capability id to a React component, with a graceful fallback.
// This is the RenderAdapter's vocabulary side: which component draws each capability.

import type { ComponentType, ReactNode } from "react";
import type { ComponentImport, ResolvedNode } from "../../../kernel/src/types";

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

// --- Namespaced provider resolution -------------------------------------------------
//
// The end-state vocabulary model: a capability is referenced as `alias:name`, never bare, and
// NOTHING is ambient — a bundle's manifest `imports` binds every alias (the floor included) to a
// component PROVIDER. This registry resolves `alias:name` -> providers[imports[alias].from][name],
// so multiple providers can offer the same name (picked explicitly by alias) and a bundle can borrow
// another bundle's capability by importing it under an alias.

/** A provider's raw capability -> component map (e.g. the floor's primitives, a bundle's own components). */
export type ProviderMap = Record<string, CapabilityView>;

/** Resolve a provider name ("floor" | "self" | a bundle name) to its component map. */
export type ProviderResolver = (from: string) => ProviderMap | undefined;

/** Split `alias:name` into its two parts on the FIRST colon (names never contain a colon). */
export function splitCapabilityRef(ref: string): { alias: string; name: string } | null {
  const i = ref.indexOf(":");
  if (i <= 0 || i >= ref.length - 1) return null;
  return { alias: ref.slice(0, i), name: ref.slice(i + 1) };
}

/**
 * Build a registry that resolves namespaced `alias:name` capabilities through a bundle's imported
 * component providers (`externals.components`). A reference resolves only when: the alias is
 * imported, the provider is known, the name exists in that provider, and (if the import declares a
 * `use` whitelist) the name is listed. Anything else falls through to `fallback` — an
 * undeclared/mistyped reference degrades gracefully, never crashes.
 */
export function buildRegistryFromImports(
  imports: Record<string, ComponentImport> | undefined,
  resolveProvider: ProviderResolver,
  fallback: CapabilityView
): ComponentRegistry {
  const specs = imports ?? {};
  return {
    get: (capability) => {
      const ref = splitCapabilityRef(capability);
      if (!ref) return undefined;
      const spec = specs[ref.alias];
      if (!spec) return undefined;
      if (spec.use && !spec.use.includes(ref.name)) return undefined;
      return resolveProvider(spec.from)?.[ref.name];
    },
    fallback,
  };
}
