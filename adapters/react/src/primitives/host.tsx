// The generic HOST: the one coded entry point that runs ANY bundle. It loads a bundle (kernel +
// shared state + effect dispatcher) and renders it with the shared primitive registry. Console,
// playground, preview, and every profile are just bundles handed to this host.

import React from "react";
import { GenUIRoot } from "../useGenUI";
import { overlayRegistry } from "../registry";
import { loadBundle, type Bundle } from "./bundle";
import { primitiveRegistry } from "./registry";
import { AppRegistryProvider, type AppRegistry } from "./apps";

export function BundleHost({
  bundle,
  apps,
}: {
  bundle: Bundle;
  /** Apps any nested `embed` leaf may mount by name (via `props.app`). */
  apps?: AppRegistry;
}): React.ReactElement {
  // Build the runtime once for the life of the host.
  const controller = React.useMemo(() => loadBundle(bundle), []); // eslint-disable-line react-hooks/exhaustive-deps
  // The floor primitives, plus this bundle's own extra capabilities (if any).
  const registry = React.useMemo(
    () => (bundle.components ? overlayRegistry(primitiveRegistry, bundle.components) : primitiveRegistry),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const tree = <GenUIRoot source={controller} registry={registry} />;
  return apps ? <AppRegistryProvider apps={apps}>{tree}</AppRegistryProvider> : tree;
}
