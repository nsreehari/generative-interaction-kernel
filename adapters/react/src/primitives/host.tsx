// The generic HOST: the one coded entry point that runs ANY bundle. It loads a bundle (kernel +
// shared state + effect dispatcher) and renders it through the component imports its manifest
// declares. Console, playground, preview, and every profile are just bundles handed to this host.

import React from "react";
import { GenUIRoot } from "../useGenUI";
import { loadBundle, type Bundle } from "./bundle";
import { buildBundleRegistry } from "./registry";
import { AppRegistryProvider, type AppRegistry } from "./apps";
import { GenUIFileServicesProvider, type GenUIFileServices } from "./fileServices";

export function BundleHost({
  bundle,
  apps,
  fileServices,
}: {
  bundle: Bundle;
  /** Apps any nested `embed` leaf may mount by name (via `props.app`). */
  apps?: AppRegistry;
  /** Optional host-level file helpers consumed by `multiFileUpload` / file-link leaves. */
  fileServices?: GenUIFileServices;
}): React.ReactElement {
  // Build the runtime once for the life of the host.
  const controller = React.useMemo(() => loadBundle(bundle), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Namespaced model: resolve every `alias:name` through the manifest `externals.projectionViews` (the
  // floor is the `floor` provider, the bundle's own projection views are `self`). Nothing is ambient.
  const registry = React.useMemo(() => buildBundleRegistry(bundle), []); // eslint-disable-line react-hooks/exhaustive-deps
  const tree = <GenUIRoot source={controller} registry={registry} />;
  const withApps = apps ? <AppRegistryProvider apps={apps}>{tree}</AppRegistryProvider> : tree;
  return <GenUIFileServicesProvider services={fileServices}>{withApps}</GenUIFileServicesProvider>;
}
