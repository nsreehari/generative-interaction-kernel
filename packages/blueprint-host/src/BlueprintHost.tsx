import React from "react";
import { ControlFace } from "@gik/controlface";
import type { Json } from "@gik/kernel";
import {
  BundleCompositionHost,
  bundleFromJson,
  type BundleContextBindings,
  type BundleNative,
  type CompositionOrganism,
  type GenUIFileServices,
  type OrganismBridge,
} from "@gik/react";
import type { LayerRecipe, ProfileArtifact, ProfileArtifactBundle } from "@gik/profile";

export interface BlueprintHostProps {
  blueprint: ProfileArtifact | ProfileArtifactBundle<LayerRecipe>;
  native?: BundleNative;
  companions?: CompositionOrganism[];
  contexts?: BundleContextBindings;
  fileServices?: GenUIFileServices;
  primaryBridge?: OrganismBridge;
  className?: string;
  style?: React.CSSProperties;
  context?: Record<string, Json>;
}

function runtimeFromBlueprint(
  blueprint: ProfileArtifact | ProfileArtifactBundle<LayerRecipe>,
  context?: Record<string, Json>,
) {
  return ControlFace.openBlueprint(blueprint, context ? { context } : undefined);
}

export function BlueprintHost({
  blueprint,
  native,
  companions = [],
  contexts = {},
  fileServices,
  primaryBridge,
  className,
  style,
  context,
}: BlueprintHostProps): React.ReactElement {
  const runtime = React.useMemo(() => runtimeFromBlueprint(blueprint, context), [blueprint, context]);
  const bundle = React.useMemo(
    () => bundleFromJson({ manifest: runtime.manifest, document: runtime.document, state: runtime.state }, native),
    [runtime, native],
  );
  const primaryId = "format" in blueprint ? blueprint.profileArtifact.payload.id : blueprint.payload.id;
  const primary = React.useMemo<CompositionOrganism>(
    () => ({ id: primaryId, bundle, bridge: primaryBridge }),
    [primaryId, bundle, primaryBridge],
  );
  return (
    <BundleCompositionHost
      primary={primary}
      companions={companions}
      contexts={contexts}
      fileServices={fileServices}
      className={className}
      style={style}
    />
  );
}
