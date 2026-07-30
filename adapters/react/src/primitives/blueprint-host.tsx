import React from "react";
import { materializeBlueprint, prepareBlueprintProgram, validateBlueprintArtifact, type BlueprintArtifact, type ExternalContext } from "@gik/blueprint";
import type { Json } from "@gik/kernel";
import { BlueprintController } from "../blueprint-controller";
import type { BlueprintControllerOptions } from "../blueprint-controller";
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
  externalContext?: ExternalContext;
  /** @deprecated Initial-state seed compatibility. Use externalContext for immutable inputs. */
  context?: Record<string, Json>;
  onTransition?: BlueprintControllerOptions["onTransition"];
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
  externalContext,
  context,
  onTransition,
}: BlueprintHostProps): React.ReactElement {
  const registry = React.useMemo(() => createBundleRegistry(), []);
  const materializedBlueprint = React.useMemo(
    () => materializeBlueprint({ blueprint, externalContext }),
    [blueprint, externalContext],
  );
  const prepared = React.useMemo(
    () => context
      ? prepareBlueprintProgram(materializedBlueprint.payload.terminalBlueprint, { context })
      : {
          blueprint: materializedBlueprint.payload.terminalBlueprint,
          vocabulary: materializedBlueprint.payload.vocabulary,
          program: materializedBlueprint.payload.program,
          initialState: materializedBlueprint.payload.initialState,
        },
    [context, materializedBlueprint],
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
    () => new BlueprintController(blueprint, {
      externalContext,
      materializedBlueprint,
      context,
      contexts,
      native,
      onTransition,
    }),
    [blueprint, externalContext, materializedBlueprint, context, contexts, native, onTransition],
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