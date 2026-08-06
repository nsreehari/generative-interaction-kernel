import React from "react";
import {
  materializeBlueprint,
  parseBlueprintReference,
  prepareBlueprintProgram,
  type MaterializedBlueprint,
} from "@gik/blueprint";
import type { BlueprintWorker } from "@gik/blueprint/worker";
import { parseRef } from "@gik/durable-runtime";
import type { BlueprintHostProps as InMemoryBlueprintHostProps } from "./blueprint-host";
import { assertBlueprintHostProjection, createHostedBlueprintProjection } from "./blueprint-host";
import { DurableBlueprintController, type DurableBlueprintRuntimeOptions } from "../durable-blueprint-controller";
import { createNativeBlueprintWorker } from "../durable-blueprint-worker";
import { bundleFromJson } from "./bundle";
import { BundleRegistryProvider, createBundleRegistry } from "./bundle-registry";
import { BundleCompositionHost, type CompositionOrganism } from "./bundle-composition-host";
import type { ProviderResolver } from "../registry";
import {
  BLUEPRINT_HOST_PROVIDER,
  BlueprintHostRegistryProvider,
  HOSTED_BLUEPRINT_CAPABILITY,
} from "./hosted-blueprint";

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
  blueprintRegistry,
  renderHostedBlueprintLoading,
}: BlueprintHostProps): React.ReactElement {
  const registry = React.useMemo(() => createBundleRegistry(), []);
  const blueprintId = blueprint.payload.id;
  const instanceId = primaryInstanceId === undefined ? blueprintId : `${blueprintId}:${primaryInstanceId}`;
  const prepared = React.useMemo(() => {
    const materialized = materializedBlueprint ?? materializeBlueprint({
      blueprint,
      externalContext,
      resolveBlueprint: (ref, childContext) => {
        if (!blueprintRegistry) throw new Error(`No Blueprint host registry can resolve '${ref}'`);
        return blueprintRegistry.resolveArtifact(parseBlueprintReference(ref), {
          ...childContext,
          parentInstanceId: instanceId,
        });
      },
    });
    if (!context) return materialized;
    const initialState = prepareBlueprintProgram(materialized.payload.terminalBlueprint, { context }).initialState;
    return {
      ...materialized,
      payload: { ...materialized.payload, initialState: structuredClone(initialState) },
    };
  }, [blueprint, blueprintRegistry, context, externalContext, instanceId, materializedBlueprint]);
  const payload = prepared.payload;
  const bundle = React.useMemo(
    () => {
      assertBlueprintHostProjection("Durable BlueprintHost", blueprintId, payload.program);
      return bundleFromJson({
        vocabulary: payload.vocabulary,
        program: payload.program,
        state: payload.initialState,
      }, native);
    },
    [payload, native, blueprintId],
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
  const HostedBlueprint = React.useMemo(
    () => createHostedBlueprintProjection({
      registry: blueprintRegistry,
      parentBlueprintId: blueprintId,
      parentInstanceId: instanceId,
      resolveLeavesProvider,
      contexts,
      fileServices,
      onTransition,
      renderHostedBlueprintLoading,
      renderHostedBlueprint: (props) => (
        <NestedDurableBlueprintHost
          key={`${props.blueprint.payload.id}:${String(props.primaryInstanceId)}`}
          {...props}
          parentRuntime={runtime}
        />
      ),
    }),
    [blueprintRegistry, blueprintId, instanceId, resolveLeavesProvider, contexts, fileServices, onTransition, renderHostedBlueprintLoading, runtime],
  );
  const hostResolveProvider = React.useMemo<ProviderResolver>(
    () => (from) => from === BLUEPRINT_HOST_PROVIDER
      ? { [HOSTED_BLUEPRINT_CAPABILITY]: HostedBlueprint }
      : resolveLeavesProvider?.(from),
    [HostedBlueprint, resolveLeavesProvider],
  );
  const primary = React.useMemo<CompositionOrganism>(
    () => ({ instanceId, bundle, source, bridge: primaryBridge }),
    [instanceId, bundle, source, primaryBridge],
  );

  return (
    <BlueprintHostRegistryProvider registry={blueprintRegistry}>
      <BundleRegistryProvider registry={registry} resolveProvider={hostResolveProvider}>
        <BundleCompositionHost
          primary={primary}
          companions={companions}
          contexts={contexts}
          fileServices={fileServices}
          className={className}
          style={style}
        />
      </BundleRegistryProvider>
    </BlueprintHostRegistryProvider>
  );
}

function NestedDurableBlueprintHost({
  parentRuntime,
  ...props
}: InMemoryBlueprintHostProps & { parentRuntime: DurableBlueprintRuntimeOptions }): React.ReactElement {
  const runtime = React.useMemo(
    () => deriveChildRuntime(parentRuntime, String(props.primaryInstanceId)),
    [parentRuntime, props.primaryInstanceId],
  );
  const materializedBlueprint = React.useMemo(
    () => materializeBlueprint({
      blueprint: props.blueprint,
      externalContext: props.externalContext,
      resolveBlueprint: (ref, childContext) => {
        if (!props.blueprintRegistry) throw new Error(`No Blueprint host registry can resolve '${ref}'`);
        return props.blueprintRegistry.resolveArtifact(parseBlueprintReference(ref), {
          ...childContext,
          parentInstanceId: String(props.primaryInstanceId),
        });
      },
    }),
    [props.blueprint, props.blueprintRegistry, props.externalContext, props.primaryInstanceId],
  );
  const worker = React.useMemo(
    () => createNativeBlueprintWorker({
      blueprint: props.blueprint,
      runtime,
      native: props.native ?? {},
      externalContext: props.externalContext,
      materializedBlueprint,
      contexts: props.contexts,
    }),
    [materializedBlueprint, props.blueprint, props.contexts, props.externalContext, props.native, runtime],
  );
  return <BlueprintHost {...props} runtime={runtime} worker={worker} materializedBlueprint={materializedBlueprint} />;
}

function deriveChildRuntime(
  parent: DurableBlueprintRuntimeOptions,
  identity: string,
): DurableBlueprintRuntimeOptions {
  return {
    runtimeId: `${parent.runtimeId}/children/${identity}`,
    providers: parent.providers,
    refs: {
      stateRef: deriveRef(parent.refs.stateRef, identity),
      journalRef: deriveRef(parent.refs.journalRef, identity),
      effectsQueueRef: deriveRef(parent.refs.effectsQueueRef, identity),
    },
  };
}

function deriveRef(parentRef: string, identity: string): string {
  const parsed = parseRef(parentRef);
  const bytes = new TextEncoder().encode(JSON.stringify({
    kind: parsed.kind,
    value: `${parsed.value}:children:${identity}`,
  }));
  const encoded = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `b64:${encoded}`;
}