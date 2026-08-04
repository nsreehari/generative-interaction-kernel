import React from "react";
import { materializeBlueprint } from "@gik/blueprint";
import type { BlueprintHostProps as InMemoryBlueprintHostProps } from "./blueprint-host";
import { DurableBlueprintController, type DurableBlueprintRuntimeOptions } from "../durable-blueprint-controller";
import { bundleFromJson } from "./bundle";
import { BundleRegistryProvider, createBundleRegistry } from "./bundle-registry";
import { BundleCompositionHost, type CompositionOrganism } from "./bundle-composition-host";

const EMPTY_COMPANIONS: CompositionOrganism[] = [];
const EMPTY_CONTEXTS = {};

export interface BlueprintHostProps extends Omit<InMemoryBlueprintHostProps, "context" | "onTransition"> {
  runtime: DurableBlueprintRuntimeOptions;
}

export function BlueprintHost({
  blueprint,
  runtime,
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
}: BlueprintHostProps): React.ReactElement {
  const registry = React.useMemo(() => createBundleRegistry(), []);
  const prepared = React.useMemo(
    () => materializeBlueprint({ blueprint, externalContext }).payload,
    [blueprint, externalContext],
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
    () => new DurableBlueprintController(blueprint, { runtime, externalContext, contexts, native }),
    [blueprint, runtime, externalContext, contexts, native],
  );
  const blueprintId = prepared.terminalBlueprint.payload.id;
  const instanceId = primaryInstanceId === undefined ? blueprintId : `${blueprintId}:${primaryInstanceId}`;
  const primary = React.useMemo<CompositionOrganism>(
    () => ({ instanceId, bundle, source, bridge: primaryBridge }),
    [instanceId, bundle, source, primaryBridge],
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