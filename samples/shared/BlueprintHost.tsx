// BlueprintHost: compile ONE Blueprint (by id) into a runnable Bundle, then host it — optionally
// alongside companion organisms that share a common set of contexts. It is the blueprint-level rung
// above BundleCompositionHost: it knows how to LOWER a Blueprint (ControlFace + native attach), but it
// knows NOTHING about any specific composition (no demo runner, no control harness). Demo/harness
// wiring is layered ON TOP by GikDemoBlueprintHost, which passes companions, contexts, and a primary
// bridge down through the generic props below.
//
// Provider resolution (for imports beyond `self` — e.g. `from: "profile"` or another bundle's views)
// comes from the ambient BundleRegistryProvider, exactly as BundleHost expects. A standalone caller is
// responsible for establishing that context.

import React from "react";
import {
  BundleCompositionHost,
  type BundleContextBindings,
  type CompositionOrganism,
  type GenUIFileServices,
  type OrganismBridge,
} from "@gik/react";
import { resolveBlueprintBundle } from "./sample-bundles";

export function BlueprintHost({
  blueprintId,
  companions = [],
  contexts = {},
  fileServices,
  primaryBridge,
  className,
}: {
  /** The Blueprint to compile and mount as the primary organism. */
  blueprintId: string;
  /** Additional organisms to mount alongside the Blueprint over the same shared contexts. */
  companions?: CompositionOrganism[];
  /** Shared namespace stores every organism inherits (caller-created and seeded). */
  contexts?: BundleContextBindings;
  /** Optional host file helpers, forwarded to the composition. */
  fileServices?: GenUIFileServices;
  /** Optional bridge wiring the primary Blueprint to the shared contexts. */
  primaryBridge?: OrganismBridge;
  /** className on the composition container — the caller owns layout. */
  className?: string;
}): React.ReactElement {
  const bundle = React.useMemo(() => resolveBlueprintBundle(blueprintId), [blueprintId]);
  const primary = React.useMemo<CompositionOrganism>(
    () => ({ id: blueprintId, bundle, bridge: primaryBridge }),
    [blueprintId, bundle, primaryBridge]
  );
  return (
    <BundleCompositionHost
      primary={primary}
      companions={companions}
      contexts={contexts}
      fileServices={fileServices}
      className={className}
    />
  );
}
