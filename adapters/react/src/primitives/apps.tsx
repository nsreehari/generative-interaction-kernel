// The APP REGISTRY: how a whole bundle becomes hostable BY NAME, anywhere.
//
// An "app" is just a Bundle. The `embed` primitive can already embed an inline JSON bundle from
// state (great for runtime-built surfaces like preview/playground). But a *known* app — one that
// ships with native effect handlers (functions, which cannot live in JSON state) — needs to be
// mounted by REFERENCE. This registry provides that reference: the host publishes a name -> Bundle
// map via context, and any `embed` leaf deep in any document can mount an app with `props.app`.
//
// The consequence is the point the platform has been driving at: there is no privileged "app shell".
// The same app bundle runs identically whether it is the outermost mount or a leaf inside another
// bundle. Hosting an app == mounting its bundle.

import React from "react";
import type { Bundle } from "./bundle";

/** Produces a fresh runtime bundle (including native effect handlers) each time it is mounted. */
export type AppFactory = () => Bundle;

/** Name -> app factory. Published by a host and resolved by `bundle` leaves via context. */
export type AppRegistry = Record<string, AppFactory>;

const AppRegistryContext = React.createContext<AppRegistry>({});

/** Publish the set of apps that any nested `embed` leaf may mount by name. */
export function AppRegistryProvider({
  apps,
  children,
}: {
  apps: AppRegistry;
  children: React.ReactNode;
}): React.ReactElement {
  return <AppRegistryContext.Provider value={apps}>{children}</AppRegistryContext.Provider>;
}

/** Resolve a registered app bundle by name (null when the name is empty or unregistered). */
export function useApp(name: string | null | undefined): Bundle | null {
  const registry = React.useContext(AppRegistryContext);
  return React.useMemo(() => {
    if (!name) return null;
    const make = registry[name];
    return make ? make() : null;
  }, [registry, name]);
}
