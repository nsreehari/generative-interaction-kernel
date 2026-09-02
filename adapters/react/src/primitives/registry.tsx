import React from "react";
import { unwrap } from "gik-kernel";
import {
  buildRegistryFromImports,
  type ComponentRegistry,
  type ProjectionView,
  type ProjectionViewProps,
  type ProviderResolver,
} from "../registry";
import type { Bundle } from "./bundle";

/** Generic diagnostic projection used whenever a host cannot resolve a capability provider. */
export const FallbackView: ProjectionView = ({ node, children }: ProjectionViewProps) => (
  <div data-fallback data-capability={node.capability}>
    <strong>{node.capability}</strong>
    <pre>{JSON.stringify(node.props, null, 2)}</pre>
    {children}
  </div>
);

/** Build a bundle registry without privileging any host-owned projection provider. */
export function buildBundleRegistry(
  bundle: Bundle,
  crossProvider?: ProviderResolver,
  structuralViews: Record<string, ProjectionView> = {},
): ComponentRegistry {
  const resolve: ProviderResolver = (from) => {
    if (from === "self") return bundle.projectionViews;
    return crossProvider?.(from);
  };
  const imported = buildRegistryFromImports(
    unwrap(bundle.vocabulary).externals?.projectionViews,
    resolve,
    FallbackView
  );
  return {
    get: (capability) => structuralViews[capability] ?? imported.get(capability),
    getStructural: (capability) => structuralViews[capability],
    fallback: imported.fallback,
  };
}
