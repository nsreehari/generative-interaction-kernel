// The generic host app opens a Blueprint selected by `?b=<id>` through GikDemoBlueprintHost. The app
// owns URL canonicalization and the switcher overlay.

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
import { createDurableRuntime } from "@gik/durable-runtime";
import {
  createBlueprintProposalDurableTransitionAdapter,
  createDurableBlueprintProposalStore,
  createInMemoryBlueprintProposalStore,
  type BlueprintProposalStore,
} from "@gik/blueprint-agent-host";
import type { UseProposal } from "./runtime/blueprint-agent-lifecycle";
import { GikDemoBlueprintHost, type DemoTargetHostProps } from "@gik/demo-runner-host";
import { resolveCapabilityDescriptors, resolveProjectionViews } from "./runtime/provider-registry";
import {
  canonicalizeHostUrl,
  readHostQuery,
} from "./host-query";
import {
  resolveBlueprintInitialContext,
  resolveBlueprintNative,
  resolveBlueprintNativeFromMaterialized,
} from "./runtime/sample-bundles";
import {
  getSampleBlueprintCatalog,
  resolveSampleBlueprintSource,
  resolveSampleLaunchExternalContext,
} from "../../../catalog/blueprint-catalog";
import { createSampleBlueprintHostRegistry } from "./runtime/hosted-blueprint-registry";
import { HostServiceDependencyAccess } from "./runtime/service-dependency-access";
import { createBrowserBlueprintStorageConnectionFactory } from "./runtime/blueprint-storage";

const embeddedHostStyle: React.CSSProperties = { height: "100vh" };

export function Host(): React.ReactElement {
  const query = readHostQuery(window.location.search, window.location.pathname);
  const targetId = query.targetId ?? getSampleBlueprintCatalog().defaultBlueprint;
  const HostComponent = query.durableEnabled ? DurableIndexedDbHost : InMemoryHost;
  React.useEffect(() => {
    const canonicalUrl = canonicalizeHostUrl(window.location.href);
    if (canonicalUrl !== window.location.href) window.history.replaceState(null, "", canonicalUrl);
  }, []);
  return (
    <HostView
      targetId={targetId}
      durableEnabled={query.durableEnabled}
      externalContext={query.externalContext}
      HostComponent={HostComponent}
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

function durableRef(value: string): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ kind: "indexed-db", value }));
  const encoded = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `b64:${encoded}`;
}

function lazyProposalStore(
  store: Promise<BlueprintProposalStore<UseProposal>>,
): BlueprintProposalStore<UseProposal> {
  return {
    create: async (receipt) => (await store).create(receipt),
    get: async (id) => (await store).get(id),
    update: async (receipt) => (await store).update(receipt),
    list: async () => (await store).list(),
  };
}

export function createSampleBlueprintProposalStore(options: {
  durableEnabled: boolean;
  blueprintId: string;
  instanceId?: string | number;
  databaseName?: string;
}): BlueprintProposalStore<UseProposal> {
  if (!options.durableEnabled) return createInMemoryBlueprintProposalStore<UseProposal>();
  const identity = `${options.blueprintId}:${options.instanceId ?? "default"}`;
  const ref = durableRef(`samples:blueprint-agent-host:${identity}`);
  const refs = { stateRef: ref, journalRef: ref, effectsQueueRef: ref };
  const runtime = createDurableRuntime({
    runtimeId: `samples:blueprint-agent-host:${identity}`,
    providers: {
      "indexed-db": createIndexedDbProvider({ databaseName: options.databaseName ?? "gik-samples-host" }),
    },
    transitionAdapter: createBlueprintProposalDurableTransitionAdapter<UseProposal>(),
  });
  return lazyProposalStore(createDurableBlueprintProposalStore<UseProposal>({ runtime, refs }));
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
  const blueprintStorageRootInstanceId = `${id}:default`;
  const blueprintStorage = React.useMemo(
    () => createBrowserBlueprintStorageConnectionFactory(durableEnabled),
    [durableEnabled],
  );
  const proposalStore = React.useMemo(
    () => createSampleBlueprintProposalStore({ durableEnabled, blueprintId: id }),
    [durableEnabled, id],
  );
  const hostedBlueprintRegistry = React.useMemo(
    () => createSampleBlueprintHostRegistry({
      createProposalStore: (blueprintId, childContext) => createSampleBlueprintProposalStore({
        durableEnabled,
        blueprintId,
        instanceId: `${childContext.parentInstanceId}/cells/${childContext.cellId}`,
      }),
      blueprintStorage,
      blueprintStorageRootInstanceId,
    }),
    [blueprintStorage, blueprintStorageRootInstanceId, durableEnabled],
  );
  const { blueprint, native } = React.useMemo(() => ({
    blueprint: resolveSampleBlueprintSource(id),
    native: resolveBlueprintNative(id, {
      proposalStore,
      blueprintStorage,
      instanceId: blueprintStorageRootInstanceId,
    }),
  }), [blueprintStorage, blueprintStorageRootInstanceId, id, proposalStore]);
  const context = React.useMemo(
    () => resolveBlueprintInitialContext(id, externalContext),
    [externalContext, id],
  );
  const demoRunnerDocument = getSampleBlueprintCatalog().demoScenarios[id];

  return (
    <>
      <GikDemoBlueprintHost
        HostComponent={HostComponent}
        blueprint={blueprint}
        externalContext={externalContext ?? resolveSampleLaunchExternalContext(id)}
        native={native}
        context={context}
        resolveNative={(materializedBlueprint) =>
          resolveBlueprintNativeFromMaterialized(id, materializedBlueprint, {
            proposalStore,
            blueprintStorage,
            instanceId: blueprintStorageRootInstanceId,
          })}
        scenariosJson={demoRunnerDocument}
        resolveLeavesProvider={resolveLeavesProvider}
        resolveCapabilityDescriptors={resolveCapabilityDescriptors}
        blueprintRegistry={hostedBlueprintRegistry}
        style={embeddedHostStyle}
      />
      <HostServiceDependencyAccess />
      <ApplicationSwitcher currentId={id} />
    </>
  );
}

function ApplicationSwitcher({ currentId }: { currentId: string }): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const blueprintIds = getSampleBlueprintCatalog().blueprints;
  const selectBlueprint = (id: string) => {
    if (id === currentId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("b", id);
    window.location.assign(url.toString());
  };

  return (
    <div className="gx-switcher" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {open ? (
        <div className="gx-switcher-panel" role="menu" aria-label="Switch application">
          <div className="gx-switcher-head">Application</div>
          {blueprintIds.map((id) => {
            const selected = id === currentId;
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={selected ? "gx-switcher-row selected" : "gx-switcher-row"}
                onClick={() => selectBlueprint(id)}
              >
                <span className="gx-switcher-check" aria-hidden="true">{selected ? "\u2713" : ""}</span>
                <span>{id}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <button
          type="button"
          className="gx-switcher-bubble"
          aria-label={`Current application: ${currentId}. Hover to switch.`}
          onClick={() => setOpen(true)}
        >
          <span aria-hidden="true">&nbsp;</span>
        </button>
      )}
    </div>
  );
}
