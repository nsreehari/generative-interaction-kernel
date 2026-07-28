// BlueprintHost: prepare ONE Blueprint (by id) as a runnable program, then host it — optionally
// alongside companion organisms that share a common set of contexts. It is the Blueprint-level rung
// above BundleCompositionHost: it owns Blueprint transition execution but knows nothing about any
// specific composition (no demo runner, no control harness). Demo/harness
// wiring is layered ON TOP by GikDemoBlueprintHost, which passes companions, contexts, and a primary
// bridge down through the generic props below.
//
// Provider resolution for imports beyond `self`, such as another bundle's projection views.
// comes from the ambient BundleRegistryProvider, exactly as BundleHost expects. A standalone caller is
// responsible for establishing that context.

import React from "react";
import {
  BlueprintHost as PublicBlueprintHost,
  type BundleContextBindings,
  type CompositionOrganism,
  type GenUIFileServices,
  type OrganismBridge,
} from "@gik/react";
import { resolveSampleBlueprintSource } from "./blueprints";
import { resolveBlueprintNative } from "./sample-bundles";

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
  const blueprint = React.useMemo(() => resolveSampleBlueprintSource(blueprintId), [blueprintId]);
  const native = React.useMemo(() => resolveBlueprintNative(blueprintId), [blueprintId]);
  return (
    <PublicBlueprintHost
      blueprint={blueprint}
      native={native}
      companions={companions}
      contexts={contexts}
      fileServices={fileServices}
      primaryBridge={primaryBridge}
      className={className}
    />
  );
}
