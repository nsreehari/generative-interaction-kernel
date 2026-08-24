// The one place the sample host assembles the trusted dependencies a catalog Blueprint runs with:
// its artifact, native code (effect handlers, projection views, the declarative service
// orchestrator), the proposal store, Blueprint storage, the hosted-Blueprint registry, and the
// hydrated initial context. Both host routes consume it -- the full `?b=<id>` route that mounts the
// Blueprint at one root, and the application root page that places named regions of the same
// Blueprint -- so neither route can drift into its own divergent wiring.

import React from "react";
import type { BlueprintArtifact, ExternalContext, MaterializedBlueprint } from "@gik/blueprint";
import type { Json } from "@gik/kernel";
import type { BundleNative, ReactBlueprintHostRegistry } from "@gik/react";
import { createIndexedDbProvider } from "@gik/durable-runtime/storage/indexed-db";
import { createDurableRuntime } from "@gik/durable-runtime";
import {
  createBlueprintProposalDurableTransitionAdapter,
  createDurableBlueprintProposalStore,
  createInMemoryBlueprintProposalStore,
  type BlueprintProposalStore,
} from "@gik/blueprint-agent-host";
import type { UseProposal } from "./runtime/blueprint-agent-lifecycle";
import { resolveSampleBlueprintSource } from "../../../catalog/blueprint-catalog";
import {
  resolveBlueprintInitialContext,
  resolveBlueprintNative,
  resolveBlueprintNativeFromMaterialized,
} from "./runtime/sample-bundles";
import { createSampleBlueprintHostRegistry } from "./runtime/hosted-blueprint-registry";
import { createBrowserBlueprintStorageConnectionFactory } from "./runtime/blueprint-storage";

export function durableRef(value: string): string {
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

export interface BlueprintHostSetupInput {
  /** Catalog Blueprint id this host route runs. */
  id: string;
  durableEnabled: boolean;
  /** The immutable external context the route materializes under; also seeds the initial state. */
  externalContext?: ExternalContext;
}

export interface BlueprintHostSetup {
  blueprint: BlueprintArtifact;
  native: BundleNative;
  /** Hydrated initial-state seed for this Blueprint under this external context. */
  context: Record<string, Json>;
  blueprintRegistry: ReactBlueprintHostRegistry;
  /** Re-resolves native code against a materialization, for hosts that materialize themselves. */
  resolveNative: (materializedBlueprint: MaterializedBlueprint) => BundleNative;
}

export function useBlueprintHostSetup({
  id,
  durableEnabled,
  externalContext,
}: BlueprintHostSetupInput): BlueprintHostSetup {
  const blueprintStorageRootInstanceId = `${id}:default`;
  const blueprintStorage = React.useMemo(
    () => createBrowserBlueprintStorageConnectionFactory(durableEnabled),
    [durableEnabled],
  );
  const proposalStore = React.useMemo(
    () => createSampleBlueprintProposalStore({ durableEnabled, blueprintId: id }),
    [durableEnabled, id],
  );
  const blueprintRegistry = React.useMemo(
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
  const resolveNative = React.useCallback(
    (materializedBlueprint: MaterializedBlueprint) =>
      resolveBlueprintNativeFromMaterialized(id, materializedBlueprint, {
        proposalStore,
        blueprintStorage,
        instanceId: blueprintStorageRootInstanceId,
      }),
    [blueprintStorage, blueprintStorageRootInstanceId, id, proposalStore],
  );

  return { blueprint, native, context, blueprintRegistry, resolveNative };
}
