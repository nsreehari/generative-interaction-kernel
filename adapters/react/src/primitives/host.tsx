// The generic HOST: the one coded entry point that runs ANY bundle. It loads a bundle (kernel +
// shared state + effect dispatcher) and renders it through the component imports its manifest
// declares. Console, playground, preview, and every profile are just bundles handed to this host.

import React from "react";
import { GenUIRoot } from "../useGenUI";
import { loadBundle, isCompositionBundle, type Bundle, type CompositionBundle } from "./bundle";
import { buildBundleRegistry } from "./registry";
import { AppRegistryProvider, type AppRegistry } from "./apps";
import { GenUIFileServicesProvider, type GenUIFileServices } from "./fileServices";

export function BundleHost({
  bundle,
  apps,
  fileServices,
}: {
  bundle: Bundle | CompositionBundle;
  /** Apps any nested `embed` leaf may mount by name (via `props.app`). */
  apps?: AppRegistry;
  /** Optional host-level file helpers consumed by `multiFileUpload` / file-link leaves. */
  fileServices?: GenUIFileServices;
}): React.ReactElement {
  // A composition bundle carries its own native layout (it stands up several child runtimes and
  // bridges them); a leaf bundle is a single document rendered through the shared floor.
  return isCompositionBundle(bundle) ? (
    <CompositionBundleHost bundle={bundle} apps={apps} fileServices={fileServices} />
  ) : (
    <LeafBundleHost bundle={bundle} apps={apps} fileServices={fileServices} />
  );
}

function CompositionBundleHost({
  bundle,
  apps,
  fileServices,
}: {
  bundle: CompositionBundle;
  apps?: AppRegistry;
  fileServices?: GenUIFileServices;
}): React.ReactElement {
  const tree = <bundle.Component />;
  const withApps = apps ? <AppRegistryProvider apps={apps}>{tree}</AppRegistryProvider> : tree;
  return <GenUIFileServicesProvider services={fileServices}>{withApps}</GenUIFileServicesProvider>;
}

function LeafBundleHost({
  bundle,
  apps,
  fileServices,
}: {
  bundle: Bundle;
  apps?: AppRegistry;
  fileServices?: GenUIFileServices;
}): React.ReactElement {
  // Build the runtime once for the life of the host.
  const controller = React.useMemo(() => loadBundle(bundle), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Namespaced model: resolve every `alias:name` through the manifest `externals.components` (the
  // floor is the `floor` provider, the bundle's own components are `self`). Nothing is ambient.
  const registry = React.useMemo(() => buildBundleRegistry(bundle), []); // eslint-disable-line react-hooks/exhaustive-deps
  const tree = <GenUIRoot source={controller} registry={registry} />;
  const withApps = apps ? <AppRegistryProvider apps={apps}>{tree}</AppRegistryProvider> : tree;
  return <GenUIFileServicesProvider services={fileServices}>{withApps}</GenUIFileServicesProvider>;
}
