// The generic HOST: the one coded entry point that runs ANY bundle. It loads a bundle (kernel +
// shared state + effect dispatcher) and renders it through the component imports its manifest
// declares. Console, playground, preview, and every profile are just bundles handed to this host.
//
// Names that a nested `embed props.app` may mount are resolved from the ambient `BundleRegistry`
// (published once at the host root via `BundleRegistryProvider`), not passed in here — so the host
// stays a pure "run this bundle" surface with no catalog of its own.

import React from "react";
import { GenUIRoot } from "../useGenUI";
import type { ProviderResolver } from "../registry";
import { loadBundle, type Bundle, type LoadBundleOptions } from "./bundle";
import { buildBundleRegistry } from "./registry";
import {
  BundleContextsProvider,
  useBundleContextSync,
  useProjectionProviderResolver,
  type BundleContextBindings,
} from "./bundle-registry";
import { GenUIFileServicesProvider, type GenUIFileServices } from "./fileServices";

/** @deprecated Use BlueprintHost for top-level applications. */
export function BundleHost({
  bundle,
  resolveProvider,
  fileServices,
  contexts = {},
  wrapOrchestrator,
}: {
  bundle: Bundle;
  /** Host-owned resolver for projection providers imported by this bundle. */
  resolveProvider?: ProviderResolver;
  /** Optional host-level file helpers consumed by `multi-file-upload` / file-link leaves. */
  fileServices?: GenUIFileServices;
  /** Shared namespace stores inherited by this bundle and any nested `ui:embed` runtimes. */
  contexts?: BundleContextBindings;
  /** Optional host-owned service or policy wrapper around the bundle's native dispatcher. */
  wrapOrchestrator?: LoadBundleOptions["wrapOrchestrator"];
}): React.ReactElement {
  const ambientResolveProvider = useProjectionProviderResolver();
  const resolvedProvider = resolveProvider ?? ambientResolveProvider;
  // Build the runtime once for the life of the host.
  const controller = React.useMemo(
    () => loadBundle(bundle, { contexts, wrapOrchestrator }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useBundleContextSync(controller, contexts);
  // Namespaced model: resolve every `alias:name` through the manifest `externals.projectionViews`;
  // package providers and the bundle's `self` views are all explicit. Nothing is ambient.
  const registry = React.useMemo(
    () => buildBundleRegistry(bundle, resolvedProvider ?? undefined),
    [bundle, resolvedProvider]
  );
  const tree = <GenUIRoot source={controller} registry={registry} />;
  return (
    <BundleContextsProvider contexts={contexts}>
      <GenUIFileServicesProvider services={fileServices}>{tree}</GenUIFileServicesProvider>
    </BundleContextsProvider>
  );
}
