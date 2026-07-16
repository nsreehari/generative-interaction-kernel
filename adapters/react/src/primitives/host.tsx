// The generic HOST: the one coded entry point that runs ANY bundle. It loads a bundle (kernel +
// shared state + effect dispatcher) and renders it through the component imports its manifest
// declares. Console, playground, preview, and every profile are just bundles handed to this host.
//
// Names that a nested `embed props.app` may mount are resolved from the ambient `BundleRegistry`
// (published once at the host root via `BundleRegistryProvider`), not passed in here — so the host
// stays a pure "run this bundle" surface with no catalog of its own.

import React from "react";
import { GenUIRoot } from "../useGenUI";
import { loadBundle, type Bundle } from "./bundle";
import { buildBundleRegistry } from "./registry";
import {
  BundleContextsProvider,
  useBundleContextSync,
  useProjectionProviderResolver,
  type BundleContextBindings,
} from "./bundle-registry";
import { GenUIFileServicesProvider, type GenUIFileServices } from "./fileServices";

export function BundleHost({
  bundle,
  fileServices,
  contexts = {},
}: {
  bundle: Bundle;
  /** Optional host-level file helpers consumed by `multi-file-upload` / file-link leaves. */
  fileServices?: GenUIFileServices;
  /** Shared namespace stores inherited by this bundle and any nested `ui:embed` runtimes. */
  contexts?: BundleContextBindings;
}): React.ReactElement {
  const resolveProvider = useProjectionProviderResolver();
  // Build the runtime once for the life of the host.
  const controller = React.useMemo(() => loadBundle(bundle, contexts), []); // eslint-disable-line react-hooks/exhaustive-deps
  useBundleContextSync(controller, contexts);
  // Namespaced model: resolve every `alias:name` through the manifest `externals.projectionViews` (the
  // floor is the `floor` provider, the bundle's own projection views are `self`). Nothing is ambient.
  const registry = React.useMemo(
    () => buildBundleRegistry(bundle, resolveProvider ?? undefined),
    [bundle, resolveProvider]
  );
  const tree = <GenUIRoot source={controller} registry={registry} />;
  return (
    <BundleContextsProvider contexts={contexts}>
      <GenUIFileServicesProvider services={fileServices}>{tree}</GenUIFileServicesProvider>
    </BundleContextsProvider>
  );
}
