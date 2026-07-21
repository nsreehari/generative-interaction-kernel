// BundleCompositionHost: the generic composition rung above BundleHost. It mounts a PRIMARY bundle
// plus zero or more COMPANION bundles that all share a common set of context stores, and lets each
// organism attach an optional bridge (a source wrap and/or a side-effect connection) so siblings can
// coordinate purely through the shared context — e.g. one organism writing a request another reacts
// to. It knows nothing about any specific domain (no demo, no control harness): it is just "run these
// bundles together over shared state." Domain wiring lives entirely in each organism's `bridge`.

import React from "react";
import { GenUIRoot, type GenUISource } from "../useGenUI";
import { GenUIController } from "../controller";
import { loadBundle, type Bundle, type LoadBundleOptions } from "./bundle";
import { buildBundleRegistry } from "./registry";
import {
  BundleContextsProvider,
  useBundleContextSync,
  useProjectionProviderResolver,
  type BundleContextBindings,
} from "./bundle-registry";
import { GenUIFileServicesProvider, type GenUIFileServices } from "./fileServices";

/**
 * Connects one organism's controller to the shared contexts. Both hooks are optional:
 * - `wrapSource` swaps the source `GenUIRoot` renders (e.g. a proxy that intercepts requests before
 *   they reach the controller). Defaults to the controller itself.
 * - `connect` runs side effects (subscribe a shared store, dispatch into the controller, write back)
 *   and returns a cleanup. Runs once per mounted organism.
 */
export interface OrganismBridge {
  wrapSource?: (controller: GenUIController, contexts: BundleContextBindings) => GenUISource;
  connect?: (controller: GenUIController, contexts: BundleContextBindings) => (() => void) | void;
}

/** One organism in a composition: a resolved bundle plus its optional bridge and orchestrator wrap. */
export interface CompositionOrganism {
  /** Stable identity — used as the React key and as the remount boundary. */
  id: string;
  /** The resolved bundle to run (already lowered; no ids, no catalog). */
  bundle: Bundle;
  /** Optional bridge wiring this organism to the shared contexts. */
  bridge?: OrganismBridge;
  /** Optional host-owned orchestrator wrap (policy / services) for this organism. */
  wrapOrchestrator?: LoadBundleOptions["wrapOrchestrator"];
}

export function BundleCompositionHost({
  primary,
  companions = [],
  contexts = {},
  fileServices,
  className,
}: {
  /** The primary organism — rendered first. */
  primary: CompositionOrganism;
  /** Companion organisms — rendered after the primary, in array order. */
  companions?: CompositionOrganism[];
  /** Shared namespace stores every organism inherits (caller-created and seeded). */
  contexts?: BundleContextBindings;
  /** Optional host file helpers, parity with BundleHost. */
  fileServices?: GenUIFileServices;
  /** className on the container that wraps all organisms — the caller owns layout. */
  className?: string;
}): React.ReactElement {
  const organisms = [primary, ...companions];
  return (
    <BundleContextsProvider contexts={contexts}>
      <GenUIFileServicesProvider services={fileServices}>
        <div className={className}>
          {organisms.map((organism) => (
            <CompositionOrganismRuntime key={organism.id} organism={organism} contexts={contexts} />
          ))}
        </div>
      </GenUIFileServicesProvider>
    </BundleContextsProvider>
  );
}

function CompositionOrganismRuntime({
  organism,
  contexts,
}: {
  organism: CompositionOrganism;
  contexts: BundleContextBindings;
}): React.ReactElement {
  const resolveProvider = useProjectionProviderResolver();
  // Build the runtime once for the life of this organism (keyed by organism.id at the parent).
  const controller = React.useMemo(
    () => loadBundle(organism.bundle, { contexts, wrapOrchestrator: organism.wrapOrchestrator }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useBundleContextSync(controller, contexts);
  const registry = React.useMemo(
    () => buildBundleRegistry(organism.bundle, resolveProvider ?? undefined),
    [organism.bundle, resolveProvider]
  );
  // A bridge may wrap the source GenUIRoot renders (stable for the life of the controller).
  const source = React.useMemo(
    () => organism.bridge?.wrapSource?.(controller, contexts) ?? controller,
    [controller] // eslint-disable-line react-hooks/exhaustive-deps
  );
  React.useEffect(() => {
    const cleanup = organism.bridge?.connect?.(controller, contexts);
    return typeof cleanup === "function" ? cleanup : undefined;
  }, [controller]); // eslint-disable-line react-hooks/exhaustive-deps
  return <GenUIRoot source={source} registry={registry} />;
}
