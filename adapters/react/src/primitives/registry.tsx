import React from "react";
import { unwrap } from "@gik/kernel";
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
  crossProvider?: ProviderResolver
): ComponentRegistry {
  const resolve: ProviderResolver = (from) => {
    if (from === "self") return bundle.projectionViews;
    return crossProvider?.(from);
  };
  return buildRegistryFromImports(
    unwrap(bundle.vocabulary).externals?.projectionViews,
    resolve,
    FallbackView
  );
}
