import React from "react";
import {
  authorProjectedProgram,
  type Action,
  type DocNode,
  type Json,
  type ProjectedVocabularyManifest,
} from "@gik/kernel";
import {
  BundleHost,
  bundleFromJson,
  type Bundle,
  type BundleContextBindings,
  type EffectHandlerMap,
  type ProviderResolver,
} from "@gik/react";

import {
  fluentComponentCapabilities,
  fluentComponentViews,
} from "./fluent/registry";
import {
  primitiveComponentCapabilities,
  primitiveComponentViews,
} from "./primitives/registry";
import {
  semanticComponentCapabilities,
  semanticComponentViews,
} from "./semantic/registry";
import { securityComponentCapabilities, securityComponentViews } from "./security/registry";
import { softwareComponentCapabilities, softwareComponentViews } from "./software/registry";

const DECLARATIVE_ACTIONS = ["assign", "assignFrom", "derive", "invoke", "route", "confirm", "emit"];

export interface GikComponentRuntimeProviderProps {
  children: React.ReactNode;
  state?: Record<string, Json>;
  effectHandlers?: EffectHandlerMap;
  contexts?: BundleContextBindings;
  resolveProvider?: ProviderResolver;
}

interface GikComponentRuntimeValue {
  state: Record<string, Json>;
  effectHandlers: EffectHandlerMap;
  contexts: BundleContextBindings;
  resolveProvider?: ProviderResolver;
}

const GikComponentRuntimeContext = React.createContext<GikComponentRuntimeValue>({
  state: {},
  effectHandlers: {},
  contexts: {},
});

export function GikComponentRuntimeProvider({
  children,
  state = {},
  effectHandlers = {},
  contexts = {},
  resolveProvider,
}: GikComponentRuntimeProviderProps): React.ReactElement {
  const value = React.useMemo(
    () => ({ state, effectHandlers, contexts, resolveProvider }),
    [state, effectHandlers, contexts, resolveProvider],
  );
  return <GikComponentRuntimeContext.Provider value={value}>{children}</GikComponentRuntimeContext.Provider>;
}

export interface GikComponentDeclarativeProps {
  nodeJson: Json;
}

function assertDocNode(value: Json): asserts value is Json & DocNode {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("GikComponentDeclarative nodeJson must be a JSON object");
  }
  const candidate = value as Record<string, Json>;
  if (typeof candidate.id !== "string" || typeof candidate.capability !== "string") {
    throw new Error("GikComponentDeclarative nodeJson requires string id and capability fields");
  }
}

function childNodes(node: DocNode): DocNode[] {
  return node.edges?.children ?? [];
}

function visitNodes(node: DocNode, visit: (current: DocNode) => void): void {
  visit(node);
  for (const child of childNodes(node)) visitNodes(child, visit);
}

function actionsIn(node: DocNode): Action[] {
  return Object.values(node.edges?.on ?? {}).flat();
}

function componentContract(capability: string) {
  const separator = capability.indexOf(":");
  const layer = capability.slice(0, separator);
  const name = capability.slice(separator + 1);
  if (layer === "fluent") {
    const descriptor = fluentComponentCapabilities[name];
    if (descriptor) return { layer, name, descriptor };
  }
  if (layer === "primitive") {
    const descriptor = primitiveComponentCapabilities[name];
    if (descriptor) return { layer, name, descriptor };
  }
  if (layer === "semantic") {
    const descriptor = semanticComponentCapabilities[name];
    if (descriptor) return { layer, name, descriptor };
  }
  if (layer === "security") {
    const descriptor = securityComponentCapabilities[name];
    if (descriptor) return { layer, name, descriptor };
  }
  if (layer === "software") {
    const descriptor = softwareComponentCapabilities[name];
    if (descriptor) return { layer, name, descriptor };
  }
  throw new Error(`GikComponentDeclarative does not recognize capability: ${capability}`);
}

export function createGikComponentDeclarativeBundle(
  nodeJson: Json,
  runtime: Pick<GikComponentRuntimeValue, "state" | "effectHandlers" | "contexts"> = {
    state: {},
    effectHandlers: {},
    contexts: {},
  },
): Bundle {
  assertDocNode(nodeJson);
  const root = nodeJson as unknown as DocNode;
  const capabilities: ProjectedVocabularyManifest["capabilities"] = {};
  const imports = new Map<string, Set<string>>();
  const requiredEffects = new Set<string>();

  visitNodes(root, (node) => {
    const { layer, name, descriptor } = componentContract(node.capability);
    capabilities[node.capability] = descriptor;
    const names = imports.get(layer) ?? new Set<string>();
    names.add(name);
    imports.set(layer, names);
    for (const action of actionsIn(node)) {
      const tool = action.do === "invoke" ? action.control.tool : undefined;
      if (typeof tool === "string") requiredEffects.add(tool);
    }
  });

  const vocabulary: ProjectedVocabularyManifest = {
    version: "1.0.0",
    expression: "jsonata",
    namespaces: Object.keys(runtime.state),
    contexts: Object.keys(runtime.contexts),
    actions: DECLARATIVE_ACTIONS,
    capabilities,
    externals: {
      projectionViews: Object.fromEntries(
        [...imports].map(([layer, names]) => [layer, { from: layer, use: [...names] }]),
      ),
      ...(requiredEffects.size > 0 ? { effectHandlers: [...requiredEffects] } : {}),
    },
  };

  return bundleFromJson({
    vocabulary: { gik: "0.1", type: "vocabulary", payload: vocabulary },
    program: authorProjectedProgram(root),
    state: runtime.state,
  }, { effectHandlers: runtime.effectHandlers });
}

export function GikComponentDeclarative({ nodeJson }: GikComponentDeclarativeProps): React.ReactElement {
  const runtime = React.useContext(GikComponentRuntimeContext);
  const bundle = React.useMemo(
    () => createGikComponentDeclarativeBundle(nodeJson, runtime),
    [nodeJson, runtime],
  );
  const resolveProvider = React.useCallback<ProviderResolver>((from) => {
    if (from === "fluent") return fluentComponentViews;
    if (from === "primitive") return primitiveComponentViews;
    if (from === "semantic") return semanticComponentViews;
    if (from === "security") return securityComponentViews;
    if (from === "software") return softwareComponentViews;
    return runtime.resolveProvider?.(from);
  }, [runtime.resolveProvider]);
  const signature = JSON.stringify([nodeJson, runtime.state]);

  return (
    <BundleHost
      key={signature}
      bundle={bundle}
      resolveProvider={resolveProvider}
      contexts={runtime.contexts}
    />
  );
}