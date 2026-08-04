import React from "react";
import {
  materializeBlueprint,
  prepareBlueprintProgram,
  type MaterializedBlueprint,
} from "@gik/blueprint";
import type { BlueprintWorker } from "@gik/blueprint/worker";
import type { BlueprintHostProps as InMemoryBlueprintHostProps } from "./blueprint-host";
import { DurableBlueprintController, type DurableBlueprintRuntimeOptions } from "../durable-blueprint-controller";
import { bundleFromJson } from "./bundle";
import { BundleRegistryProvider, createBundleRegistry } from "./bundle-registry";
import { BundleCompositionHost, type CompositionOrganism } from "./bundle-composition-host";

const EMPTY_COMPANIONS: CompositionOrganism[] = [];
const EMPTY_CONTEXTS = {};

export interface BlueprintHostProps extends InMemoryBlueprintHostProps {
  runtime: DurableBlueprintRuntimeOptions;
  worker?: BlueprintWorker;
  materializedBlueprint?: MaterializedBlueprint;
}

export function BlueprintHost({
  blueprint,
  runtime,
  worker,
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
  materializedBlueprint,
}: BlueprintHostProps): React.ReactElement {
  const registry = React.useMemo(() => createBundleRegistry(), []);
  const prepared = React.useMemo(() => {
    const materialized = materializedBlueprint ?? materializeBlueprint({ blueprint, externalContext });
    if (!context) return materialized;
    const initialState = prepareBlueprintProgram(materialized.payload.terminalBlueprint, { context }).initialState;
    return {
      ...materialized,
      payload: { ...materialized.payload, initialState: structuredClone(initialState) },
    };
  }, [blueprint, context, externalContext, materializedBlueprint]);
  const payload = prepared.payload;
  const bundle = React.useMemo(
    () => bundleFromJson({
      vocabulary: payload.vocabulary,
      program: payload.program,
      state: payload.initialState,
    }, native),
    [payload, native],
  );
  const source = React.useMemo(
    () => new DurableBlueprintController(blueprint, {
      runtime,
      externalContext,
      contexts,
      worker,
      materializedBlueprint: prepared,
      onTransition,
    }),
    [blueprint, runtime, externalContext, contexts, worker, prepared, onTransition],
  );
  React.useEffect(() => {
    if (!worker) return;
    void worker.start();
    return () => worker.stop();
  }, [worker]);
  const blueprintId = payload.terminalBlueprint.payload.id;
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