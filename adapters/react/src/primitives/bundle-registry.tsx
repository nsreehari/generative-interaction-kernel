// The BUNDLE REGISTRY: one mutable, observable catalog of everything mountable by name — it replaces
// the two static registries (the host's build-time catalog and the old app-embed map). It is SEEDED at
// startup from the on-disk bundles and MUTABLE at runtime: `registerBundle` (idempotent) and
// `unregisterBundle` let fetched, plugin, or user-authored bundles come and go without a rebuild. The
// host switcher lists it and every `embed props.app` resolves names against the SAME registry, so
// "an app is just a bundle, hostable anywhere" stays literally true — the standalone mount and an
// embedded one are the exact same bundle.
//
// register/unregister mutate the CATALOG only. A bundle already MOUNTED is owned by whoever mounted it
// (React lifecycle owns its runtime), so unregistering a live bundle simply stops NEW mounts by that
// name — it never tears an existing instance down.

import React from "react";
import type { StateModel } from "@gik/kernel";
import type { GenUIController } from "../controller";
import type { ProviderResolver } from "../registry";
import type { Bundle } from "./bundle";

/** Produces a fresh bundle each time it is mounted (native handlers are functions, so a factory —
 *  not JSON — is the unit that can be registered). */
export type BundleFactory = () => Bundle;

/** A catalog entry: a kernel bundle (mountable anywhere — host or `embed`), or a native root component
 *  (an irreducibly-native composition, host-mountable only). `listable` (default true) is whether the
 *  switcher offers it; embed-only apps register with `listable: false`. */
export type RegistryEntry =
  | { kind: "bundle"; make: BundleFactory; listable?: boolean }
  | { kind: "native-root"; Root: React.ComponentType; listable?: boolean };

export interface BundleRegistry {
  /** Idempotent upsert: registering an existing id replaces its entry (never duplicates). */
  registerBundle(id: string, entry: RegistryEntry): void;
  /** Remove from the catalog; no-op if absent. Does NOT unmount live instances. */
  unregisterBundle(id: string): void;
  get(id: string): RegistryEntry | undefined;
  has(id: string): boolean;
  /** Registered ids in registration order. Pass `{ listable: true }` for switcher-visible ids only. */
  ids(opts?: { listable?: boolean }): readonly string[];
  /** Subscribe to catalog changes; returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** Create an empty runtime registry. Seed it with `registerBundle` at startup; mutate it any time. */
export function createBundleRegistry(): BundleRegistry {
  const entries = new Map<string, RegistryEntry>();
  const listeners = new Set<() => void>();
  // Cached id snapshots so `ids()` returns a STABLE reference between mutations (required by
  // useSyncExternalStore, which loops if the snapshot identity changes every render). Both are
  // invalidated on any register/unregister.
  let allSnap: readonly string[] | null = null;
  let listableSnap: readonly string[] | null = null;

  const invalidate = () => {
    allSnap = null;
    listableSnap = null;
    for (const l of listeners) l();
  };

  return {
    registerBundle(id, entry) {
      entries.set(id, entry); // upsert — idempotent: same id converges, never duplicates
      invalidate();
    },
    unregisterBundle(id) {
      if (entries.delete(id)) invalidate();
    },
    get: (id) => entries.get(id),
    has: (id) => entries.has(id),
    ids(opts) {
      if (opts?.listable) {
        return (listableSnap ??= [...entries]
          .filter(([, e]) => e.listable !== false)
          .map(([id]) => id));
      }
      return (allSnap ??= [...entries.keys()]);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const BundleRegistryContext = React.createContext<BundleRegistry | null>(null);
const ProjectionProviderResolverContext = React.createContext<ProviderResolver | null>(null);
export type BundleContextBindings = Record<string, StateModel>;
const BundleContextsContext = React.createContext<BundleContextBindings>({});

/** Publish the registry that the host switcher and every `embed props.app` resolve against. */
export function BundleRegistryProvider({
  registry,
  resolveProvider,
  children,
}: {
  registry: BundleRegistry;
  resolveProvider?: ProviderResolver;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <BundleRegistryContext.Provider value={registry}>
      <ProjectionProviderResolverContext.Provider value={resolveProvider ?? null}>
        {children}
      </ProjectionProviderResolverContext.Provider>
    </BundleRegistryContext.Provider>
  );
}

/** The ambient registry (null when no provider — e.g. a bare bundle mounted without one). */
export function useBundleRegistry(): BundleRegistry | null {
  return React.useContext(BundleRegistryContext);
}

/** An optional host-owned provider resolver for bundle imports beyond `floor` / `self`. */
export function useProjectionProviderResolver(): ProviderResolver | null {
  return React.useContext(ProjectionProviderResolverContext);
}

/** Context namespace stores inherited by a BundleHost and every nested `ui:embed`. */
export function BundleContextsProvider({
  contexts,
  children,
}: {
  contexts: BundleContextBindings;
  children: React.ReactNode;
}): React.ReactElement {
  return <BundleContextsContext.Provider value={contexts}>{children}</BundleContextsContext.Provider>;
}

export function useBundleContexts(): BundleContextBindings {
  return React.useContext(BundleContextsContext);
}

/** Reconcile a runtime whenever an observable shared context is written by any sibling runtime. */
export function useBundleContextSync(
  controller: GenUIController | null | undefined,
  contexts: BundleContextBindings
): void {
  React.useEffect(() => {
    if (!controller) return;
    const stores = [...new Set(Object.values(contexts))];
    const unsubscribes = stores.map((store) => {
      const observable = store as StateModel & { subscribe?: (listener: () => void) => () => void };
      return observable.subscribe?.(() => {
        void controller.resync();
      });
    });
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe?.();
    };
  }, [controller, contexts]);
}

const EMPTY_IDS: readonly string[] = [];

/** Reactively read the registered ids; re-renders on register/unregister. */
export function useRegistryIds(opts?: { listable?: boolean }): readonly string[] {
  const registry = useBundleRegistry();
  const listable = opts?.listable ?? false;
  const subscribe = React.useCallback(
    (cb: () => void) => (registry ? registry.subscribe(cb) : () => {}),
    [registry]
  );
  const getSnapshot = React.useCallback(
    () => (registry ? registry.ids({ listable }) : EMPTY_IDS),
    [registry, listable]
  );
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
