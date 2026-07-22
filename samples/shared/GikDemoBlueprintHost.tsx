// GikDemoBlueprintHost: the DEMO rung on top of BlueprintHost. It knows the GIK sample demo shape —
// the demo-runner panel, the optional control harness, and the control/demo/soc shared contexts that
// wire a target Blueprint to them. It resolves those companion bundles, seeds the shared contexts, and
// builds the control BRIDGE that lets the demo-runner drive the target (and completes human gates),
// then hands everything to the demo-agnostic BlueprintHost. URL/query concerns stay in the app host,
// which feeds resolved ids in and reacts to presentation-preset changes via `onPresentationPresetChange`.

import React from "react";
import { GikDemoBlueprintHost as PublicGikDemoBlueprintHost } from "@gik/blueprint-host";
import { resolveBlueprintBundle, resolveBlueprintNative } from "./sample-bundles";
import { demoScenariosJson } from "./demo-catalog";
import { resolveSampleBlueprintSource } from "./blueprints";

export function GikDemoBlueprintHost({
  blueprintId,
  demoId,
  showControlHarness = false,
  presentationContext,
  className,
  onPresentationPresetChange,
}: {
  /** The target Blueprint the demo drives. */
  blueprintId: string;
  /** The scenario (demo) id that scripts the run. */
  demoId: string;
  /** Whether to mount the control harness alongside the target + runner. */
  showControlHarness?: boolean;
  /** Requested presentation preset id (raw, from the host's query). */
  presentationContext?: string | null;
  /** className merged onto the composition container. */
  className?: string;
  /** Fired with the active preset id on seed and whenever it changes (host syncs its URL). */
  onPresentationPresetChange?: (presetId: string) => void;
}): React.ReactElement {
  const blueprint = React.useMemo(() => resolveSampleBlueprintSource(blueprintId), [blueprintId]);
  const native = React.useMemo(() => resolveBlueprintNative(blueprintId), [blueprintId]);
  const targetBundle = React.useMemo(() => resolveBlueprintBundle(blueprintId), [blueprintId]);

  return (
    <PublicGikDemoBlueprintHost
      blueprint={blueprint}
      native={native}
      scenariosJson={demoScenariosJson}
      blueprintState={targetBundle.state as Record<string, unknown> | undefined}
      showControlHarness={showControlHarness}
      presentationContext={presentationContext}
      className={className}
      onPresentationPresetChange={onPresentationPresetChange}
    />
  );
}
