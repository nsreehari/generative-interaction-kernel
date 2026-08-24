// The generic host app opens a Blueprint selected by an explicit `?b=<id>` through
// GikDemoBlueprintHost. Without that parameter there is no single "current" Blueprint at all: the
// host renders its own application root page, which composes named regions of an embedded Blueprint
// Studio instead of silently opening a default Blueprint. The app owns URL canonicalization and the
// switcher overlay.

import React from "react";
import { Spinner } from "@fluentui/react-components";
import {
  materializeBlueprint,
  parseBlueprintReference,
  prepareBlueprintProgram,
  type ExternalContext,
} from "@gik/blueprint";
import { BlueprintHost as InMemoryBlueprintHost, buildCapabilityCatalogFromExternals, type CapabilityDescriptorResolver, type ProviderResolver } from "@gik/react";
import { BlueprintHost as DurableBlueprintHost, createNativeBlueprintWorker } from "@gik/react/durable";
import { createIndexedDbProvider } from "@gik/durable-runtime/storage/indexed-db";
import { GikDemoBlueprintHost, type DemoTargetHostProps } from "@gik/demo-runner-host";
import { resolveCapabilityDescriptors, resolveProjectionViews } from "./runtime/provider-registry";
import {
  canonicalizeHostUrl,
  readHostQuery,
} from "./host-query";
import {
  getSampleBlueprintCatalog,
  resolveSampleLaunchExternalContext,
} from "../../../catalog/blueprint-catalog";
import { HostServiceDependencyAccess } from "./runtime/service-dependency-access";
import { ApplicationSwitcher } from "./ApplicationSwitcher";
import { AppRootPage } from "./AppRootPage";
import { durableRef, useBlueprintHostSetup } from "./blueprint-host-setup";

export { createSampleBlueprintProposalStore } from "./blueprint-host-setup";

const embeddedHostStyle: React.CSSProperties = { height: "100vh" };

export function Host(): React.ReactElement {
  const query = readHostQuery(window.location.search, window.location.pathname);
  React.useEffect(() => {
    const canonicalUrl = canonicalizeHostUrl(window.location.href);
    if (canonicalUrl !== window.location.href) window.history.replaceState(null, "", canonicalUrl);
  }, []);
  // No selected Blueprint is not "the default Blueprint": it is the application root itself.
  if (query.targetId === null) return <AppRootPage />;
  return (
    <HostView
      targetId={query.targetId}
      durableEnabled={query.durableEnabled}
      externalContext={query.externalContext}
      HostComponent={query.durableEnabled ? DurableIndexedDbHost : InMemoryHost}
      resolveLeavesProvider={resolveProjectionViews}
      resolveCapabilityDescriptors={resolveCapabilityDescriptors}
    />
  );
}
function hostedBlueprintLoading(): React.ReactElement {
  return <Spinner label={"Loading analysis\u00a0\u2026"} labelPosition="after" size="small" />;
}

function InMemoryHost(props: DemoTargetHostProps): React.ReactElement {
  return <InMemoryBlueprintHost {...props} renderHostedBlueprintLoading={hostedBlueprintLoading} />;
}

function DurableIndexedDbHost(props: DemoTargetHostProps): React.ReactElement {
  const blueprintId = props.blueprint.payload.id;
  const [indexedDbProvider] = React.useState(() =>
    createIndexedDbProvider({ databaseName: "gik-samples-host" }));
  const materializedBlueprint = React.useMemo(() => {
    const parentInstanceId = props.primaryInstanceId === undefined
      ? blueprintId
      : `${blueprintId}:${props.primaryInstanceId}`;
    const materialized = materializeBlueprint({
      blueprint: props.blueprint,
      externalContext: props.externalContext,
      resolveBlueprint: (ref, childContext) => {
        if (!props.blueprintRegistry) throw new Error(`No Blueprint host registry can resolve '${ref}'`);
        return props.blueprintRegistry.resolveArtifact(parseBlueprintReference(ref), {
          ...childContext,
          parentInstanceId,
        });
      },
      ...(props.resolveCapabilityDescriptors
        ? { capabilityCatalog: buildCapabilityCatalogFromExternals(props.blueprint.payload.runtime?.externals, props.resolveCapabilityDescriptors) }
        : {}),
    });
    if (!props.context) return materialized;
    const initialState = prepareBlueprintProgram(materialized.payload.terminalBlueprint, {
      context: props.context,
    }).initialState;
    return {
      ...materialized,
      payload: { ...materialized.payload, initialState: structuredClone(initialState) },
    };
  }, [blueprintId, props.blueprint, props.blueprintRegistry, props.context, props.externalContext, props.primaryInstanceId, props.resolveCapabilityDescriptors]);
  const runtime = React.useMemo(() => {
    const identity = JSON.stringify({
      blueprintId,
      instanceId: props.primaryInstanceId ?? "default",
      externalContext: props.externalContext ?? {},
      context: props.context ?? {},
    });
    const ref = durableRef(`samples:${identity}`);
    return {
      runtimeId: ref,
      providers: { "indexed-db": indexedDbProvider },
      refs: { stateRef: ref, journalRef: ref, effectsQueueRef: ref },
    };
  }, [blueprintId, indexedDbProvider, props.context, props.externalContext, props.primaryInstanceId]);
  const worker = React.useMemo(() => props.native
    ? createNativeBlueprintWorker({
        blueprint: props.blueprint,
        runtime,
        native: props.native,
        externalContext: props.externalContext,
        materializedBlueprint,
        contexts: props.contexts,
      })
    : undefined,
  [materializedBlueprint, props.blueprint, props.contexts, props.externalContext, props.native, runtime]);
  return (
    <DurableBlueprintHost
      {...props}
      runtime={runtime}
      worker={worker}
      materializedBlueprint={materializedBlueprint}
      renderHostedBlueprintLoading={hostedBlueprintLoading}
    />
  );
}

function HostView({
  targetId,
  durableEnabled,
  externalContext,
  HostComponent,
  resolveLeavesProvider,
  resolveCapabilityDescriptors,
}: {
  targetId: string;
  durableEnabled: boolean;
  externalContext?: ExternalContext;
  HostComponent: React.ComponentType<DemoTargetHostProps>;
  resolveLeavesProvider: ProviderResolver;
  resolveCapabilityDescriptors: CapabilityDescriptorResolver;
}): React.ReactElement {
  const id = targetId;
  const launchExternalContext = externalContext ?? resolveSampleLaunchExternalContext(id);
  const { blueprint, native, context, blueprintRegistry, resolveNative } = useBlueprintHostSetup({
    id,
    durableEnabled,
    externalContext,
  });
  const demoRunnerDocument = getSampleBlueprintCatalog().demoScenarios[id];

  return (
    <>
      <GikDemoBlueprintHost
        HostComponent={HostComponent}
        blueprint={blueprint}
        externalContext={launchExternalContext}
        native={native}
        context={context}
        resolveNative={resolveNative}
        scenariosJson={demoRunnerDocument}
        resolveLeavesProvider={resolveLeavesProvider}
        resolveCapabilityDescriptors={resolveCapabilityDescriptors}
        blueprintRegistry={blueprintRegistry}
        style={embeddedHostStyle}
      />
      <HostServiceDependencyAccess />
      <ApplicationSwitcher currentId={id} />
    </>
  );
}
