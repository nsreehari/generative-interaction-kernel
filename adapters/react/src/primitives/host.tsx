// The generic HOST: the one coded entry point that runs ANY bundle. It loads a bundle (kernel +
// shared state + effect dispatcher) and renders it with the shared primitive registry. Console,
// playground, preview, and every profile are just bundles handed to this host.

import React from "react";
import { unwrap } from "../../../../kernel/src/index";
import { GenUIRoot } from "../useGenUI";
import { overlayRegistry } from "../registry";
import { loadBundle, type Bundle } from "./bundle";
import { primitiveRegistry, buildBundleRegistry } from "./registry";
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
  // Namespaced model: resolve every `alias:name` through the manifest `externals.components`.
  // Bundles that don't yet declare externals fall back to the legacy overlay path (floor + own
  // components) until migrated.
  const registry = React.useMemo(
    () =>
      unwrap(bundle.manifest).externals?.components
        ? buildBundleRegistry(bundle)
        : bundle.components
          ? overlayRegistry(primitiveRegistry, bundle.components)
          : primitiveRegistry,
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const tree = <GenUIRoot source={controller} registry={registry} />;
  return apps ? <AppRegistryProvider apps={apps}>{tree}</AppRegistryProvider> : tree;
}
