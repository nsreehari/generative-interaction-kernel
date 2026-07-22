import React from "react";
import { openBlueprint } from "@gik/controlface/blueprint";
import type { Json } from "@gik/kernel";
import {
  BundleRegistryProvider,
  BundleCompositionHost,
  bundleFromJson,
  createBundleRegistry,
  type BundleContextBindings,
  type BundleNative,
  type CompositionOrganism,
  type GenUIFileServices,
  type OrganismBridge,
  type ProviderResolver,
} from "@gik/react";
import type { BlueprintArtifact, LayerRecipe } from "@gik/profile";

const EMPTY_COMPANIONS: CompositionOrganism[] = [];
const EMPTY_CONTEXTS: BundleContextBindings = {};

export interface BlueprintHostProps {
  blueprint: BlueprintArtifact<LayerRecipe>;
  resolveLeavesProvider?: ProviderResolver;
  native?: BundleNative;
  companions?: CompositionOrganism[];
  contexts?: BundleContextBindings;
  fileServices?: GenUIFileServices;
  primaryBridge?: OrganismBridge;
  primaryInstanceKey?: string | number;
  className?: string;
  style?: React.CSSProperties;
  context?: Record<string, Json>;
}

function runtimeFromBlueprint(
  blueprint: BlueprintArtifact<LayerRecipe>,
  context?: Record<string, Json>,
) {
  return openBlueprint(blueprint, context ? { context } : undefined);
}

export function BlueprintHost({
  blueprint,
  resolveLeavesProvider,
  native,
  companions = EMPTY_COMPANIONS,
  contexts = EMPTY_CONTEXTS,
  fileServices,
  primaryBridge,
  primaryInstanceKey,
  className,
  style,
  context,
}: BlueprintHostProps): React.ReactElement {
  const registry = React.useMemo(() => createBundleRegistry(), []);
  const runtime = React.useMemo(() => runtimeFromBlueprint(blueprint, context), [blueprint, context]);
  const bundle = React.useMemo(
    () => bundleFromJson({ manifest: runtime.manifest, document: runtime.document, state: runtime.state }, native),
    [runtime, native],
  );
  const blueprintId = blueprint.payload.id;
  const primaryId = primaryInstanceKey === undefined ? blueprintId : `${blueprintId}:${primaryInstanceKey}`;
  const primary = React.useMemo<CompositionOrganism>(
    () => ({ id: primaryId, bundle, bridge: primaryBridge }),
    [primaryId, bundle, primaryBridge],
  );
  return (
    <BundleRegistryProvider registry={registry} resolveProvider={resolveLeavesProvider}>
      <BundleCompositionHost
        primary={primary}
        companions={companions}
        contexts={contexts}
        fileServices={fileServices}
        className={className}
        style={style}
      />
    </BundleRegistryProvider>
  );
}
