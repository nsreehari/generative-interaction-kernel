import React from "react";
import { prepareBlueprintProgram, validateBlueprintArtifact, type BlueprintArtifact } from "@gik/blueprint";
import type { Json } from "@gik/kernel";
import { BlueprintController } from "../blueprint-controller";
import type { ProviderResolver } from "../registry";
import { bundleFromJson, type BundleNative } from "./bundle";
import {
  BundleRegistryProvider,
  createBundleRegistry,
  type BundleContextBindings,
} from "./bundle-registry";
import {
  BundleCompositionHost,
  type CompositionOrganism,
  type OrganismBridge,
} from "./bundle-composition-host";
import type { GenUIFileServices } from "./fileServices";

export { validateBlueprintArtifact, type BlueprintArtifact };

const EMPTY_COMPANIONS: CompositionOrganism[] = [];
const EMPTY_CONTEXTS: BundleContextBindings = {};

export interface BlueprintHostProps {
  blueprint: BlueprintArtifact;
  resolveLeavesProvider?: ProviderResolver;
  native?: BundleNative;
  companions?: CompositionOrganism[];
  contexts?: BundleContextBindings;
  fileServices?: GenUIFileServices;
  primaryBridge?: OrganismBridge;
  primaryInstanceId?: string | number;
  className?: string;
  style?: React.CSSProperties;
  context?: Record<string, Json>;
}

export function BlueprintHost({
  blueprint,
  resolveLeavesProvider,
  native,
  companions = EMPTY_COMPANIONS,
  contexts = EMPTY_CONTEXTS,
  fileServices,
  primaryBridge,
  primaryInstanceId,
  className,
  style,
  context,
}: BlueprintHostProps): React.ReactElement {
  const registry = React.useMemo(() => createBundleRegistry(), []);
  const prepared = React.useMemo(
    () => prepareBlueprintProgram(blueprint, { context }),
    [blueprint, context],
  );
  const bundle = React.useMemo(
    () => bundleFromJson({
      vocabulary: prepared.vocabulary,
      program: prepared.program,
      state: prepared.initialState,
    }, native),
    [prepared, native],
  );
  const source = React.useMemo(
    () => new BlueprintController(prepared.blueprint, { context, contexts, native }),
    [prepared.blueprint, context, contexts, native],
  );
  const blueprintId = prepared.blueprint.payload.id;
  const primaryInstanceIdResolved = primaryInstanceId === undefined ? blueprintId : `${blueprintId}:${primaryInstanceId}`;
  const primary = React.useMemo<CompositionOrganism>(
    () => ({ instanceId: primaryInstanceIdResolved, bundle, source, bridge: primaryBridge }),
    [primaryInstanceIdResolved, bundle, source, primaryBridge],
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