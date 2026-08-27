// Maps a capability id to a React component, with a graceful fallback.
// This is the RenderAdapter's vocabulary side: which component draws each capability.

import type { ComponentType, ReactNode } from "react";
import type { CapabilityDescriptor, ProjectionViewImport, ResolvedNode } from "@gik-ai/kernel";

export interface ProjectionViewProps {
  node: ResolvedNode;
  /** Emit a behavior event for this node (node id is already bound). */
  emit: (name: string, payload?: Record<string, unknown>, actorId?: string) => void | Promise<unknown>;
  children: ReactNode;
}

export type ProjectionView = ComponentType<ProjectionViewProps>;

export interface ComponentRegistry {
  get(capability: string): ProjectionView | undefined;
  getStructural?(capability: string): ProjectionView | undefined;
  readonly fallback: ProjectionView;
}

export function createRegistry(
  map: Record<string, ProjectionView>,
  fallback: ProjectionView
): ComponentRegistry {
  return {
    get: (capability) => map[capability],
    fallback,
  };
}

// --- Namespaced provider resolution -------------------------------------------------
//
// The end-state vocabulary model: a capability is referenced as `alias:name`, never bare, and
// NOTHING is ambient — a bundle's manifest `imports` binds every alias to a
// component PROVIDER. This registry resolves `alias:name` -> providers[imports[alias].from][name],
// so multiple providers can offer the same name (picked explicitly by alias) and a bundle can borrow
// another bundle's capability by importing it under an alias.

/** A provider's raw capability -> component map (for example, package or bundle-native views). */
export type ProviderMap = Record<string, ProjectionView>;

/** Resolve a provider name (for example, a package id, `self`, or another bundle) to its component map. */
export type ProviderResolver = (from: string) => ProviderMap | undefined;

/** Split `alias:name` into its two parts on the FIRST colon (names never contain a colon). */
export function splitCapabilityRef(ref: string): { alias: string; name: string } | null {
  const i = ref.indexOf(":");
  if (i <= 0 || i >= ref.length - 1) return null;
  return { alias: ref.slice(0, i), name: ref.slice(i + 1) };
}

/**
 * Build a registry that resolves namespaced `alias:name` capabilities through a bundle's imported
 * projection-view providers (`externals.projectionViews`). A reference resolves only when: the alias is
 * imported, the provider is known, the name exists in that provider, and (if the import declares a
 * `use` whitelist) the name is listed. Anything else falls through to `fallback` — an
 * undeclared/mistyped reference degrades gracefully, never crashes.
 */
export function buildRegistryFromImports(
  imports: Record<string, ProjectionViewImport> | undefined,
  resolveProvider: ProviderResolver,
  fallback: ProjectionView
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

// --- Namespaced capability-descriptor resolution -------------------------------------

/** A provider's raw capability -> descriptor map (for example, one package's own component catalog). */
export type CapabilityDescriptorMap = Record<string, CapabilityDescriptor>;

/** Resolve a provider name to its descriptor map, the descriptor-side counterpart of {@link ProviderResolver}. */
export type CapabilityDescriptorResolver = (from: string) => CapabilityDescriptorMap | undefined;

/**
 * Build the flat `alias:name -> CapabilityDescriptor` catalog `materializeBlueprint`'s
 * `capabilityCatalog` option expects, resolved through the SAME `externals.projectionViews`
 * alias/provider/`use`-whitelist rules {@link buildRegistryFromImports} already applies to views --
 * so a host's real component descriptors reach terminal validation using the identical resolution a
 * Blueprint's own views already go through, never a second, divergent mapping. A host that supplies
 * no `resolveDescriptors` (or whose provider has no descriptor for a referenced name) simply omits
 * that capability from the catalog; `deriveCapabilities` already falls back to a permissive
 * descriptor for anything the catalog doesn't cover, matching an unresolved view's own graceful
 * fallback-view behavior.
 */
export function buildCapabilityCatalogFromImports(
  imports: Record<string, ProjectionViewImport> | undefined,
  resolveDescriptors: CapabilityDescriptorResolver,
): CapabilityDescriptorMap {
  const catalog: CapabilityDescriptorMap = {};
  for (const [alias, spec] of Object.entries(imports ?? {})) {
    const descriptors = resolveDescriptors(spec.from);
    if (!descriptors) continue;
    for (const [name, descriptor] of Object.entries(descriptors)) {
      if (spec.use && !spec.use.includes(name)) continue;
      catalog[`${alias}:${name}`] = descriptor;
    }
  }
  return catalog;
}

/** Convenience overload reading `externals.projectionViews` straight off a Blueprint's `runtime.externals`. */
export function buildCapabilityCatalogFromExternals(
  externals: { projectionViews?: Record<string, ProjectionViewImport> } | undefined,
  resolveDescriptors: CapabilityDescriptorResolver,
): CapabilityDescriptorMap {
  return buildCapabilityCatalogFromImports(externals?.projectionViews, resolveDescriptors);
}

