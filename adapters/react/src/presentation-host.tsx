import React, { useContext, useSyncExternalStore } from "react";
import type { Json, ResolvedNode } from "gik-kernel";
import type { EmitFn } from "./render";
import { SharedContextStore } from "./shared-context";

export type PresentationEventBinding =
  | { effect: string; event?: never }
  | { event: { node: string; name: string }; effect?: never };

export interface PresentationBinding {
  props?: Readonly<Record<string, { from: string }>>;
  on?: Readonly<Record<string, PresentationEventBinding>>;
}

export interface PresentationEffectContext {
  node: string;
  name: string;
  payload?: Record<string, unknown>;
  actorId?: string;
  get(path: string): Json;
  set(path: string, value: Json): void;
}

export type PresentationEffectHandler = (context: PresentationEffectContext) => void | Promise<void>;

export interface PresentationHostOptions {
  state?: Record<string, Json>;
  bindings?: Readonly<Record<string, PresentationBinding>>;
  effects?: Readonly<Record<string, PresentationEffectHandler>>;
}

function assertStatePath(path: string): void {
  if (path.split(".").some((part) => !part || ["__proto__", "prototype", "constructor"].includes(part))) {
    throw new Error(`Invalid presentation-host state path '${path}'`);
  }
}

/** Rendering-local state and effects. Never passed to a Blueprint worker or materialization. */
export class PresentationHost {
  private readonly state = SharedContextStore.create();
  private readonly bindings: ReadonlyMap<string, PresentationBinding>;
  private readonly effects = new Map<string, PresentationEffectHandler>();
  private revision = 0;

  constructor(options: PresentationHostOptions = {}) {
    this.bindings = new Map(Object.entries(structuredClone(options.bindings ?? {})));
    for (const [path, value] of Object.entries(options.state ?? {})) this.set(path, value);
    this.state.subscribe(() => { this.revision += 1; });
    this.registerEffects(options.effects ?? {});
  }

  readonly subscribe = (listener: () => void): (() => void) => this.state.subscribe(listener);
  readonly getRevision = (): number => this.revision;

  getState(): Readonly<Record<string, Json>> {
    return structuredClone(this.state.snapshot());
  }

  get(path: string): Json {
    assertStatePath(path);
    return structuredClone(this.state.get(path));
  }

  set(path: string, value: Json): void {
    assertStatePath(path);
    this.state.apply([{ op: "set", path, value: structuredClone(value) }]);
  }

  registerEffects(effects: Readonly<Record<string, PresentationEffectHandler>>): () => void {
    const entries = Object.entries(effects);
    for (const [name, handler] of entries) {
      if (!/^[^:\s]+:[^\s]+$/.test(name) || typeof handler !== "function") {
        throw new Error(`Presentation effect '${name}' requires a namespaced name and a handler`);
      }
      if (this.effects.has(name)) throw new Error(`Presentation effect '${name}' is already registered`);
    }
    for (const [name, handler] of entries) this.effects.set(name, handler);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      for (const [name] of entries) this.effects.delete(name);
    };
  }

  project(node: ResolvedNode): ResolvedNode {
    const bindings = this.bindings.get(node.id)?.props;
    if (!bindings) return node;
    return {
      ...node,
      props: {
        ...node.props,
        ...Object.fromEntries(Object.entries(bindings).map(([prop, binding]) => [prop, this.get(binding.from)])),
      },
    };
  }

  async emit(
    emit: EmitFn,
    node: string,
    name: string,
    payload?: Record<string, unknown>,
    actorId?: string,
  ): Promise<unknown> {
    const handlers = this.bindings.get(node)?.on;
    const binding = handlers && Object.hasOwn(handlers, name) ? handlers[name] : undefined;
    if (!binding) return emit(node, name, payload, actorId);
    if (binding.event) return emit(binding.event.node, binding.event.name, payload, actorId);
    const handler = this.effects.get(binding.effect);
    if (!handler) throw new Error(`Presentation effect '${binding.effect}' is not registered (node '${node}', event '${name}')`);
    await handler({
      node, name, payload, actorId,
      get: (path) => this.get(path),
      set: (path, value) => this.set(path, value),
    });
  }
}

const PresentationHostContext = React.createContext<PresentationHost | undefined>(undefined);
const noSubscription = (): (() => void) => () => {};
const noRevision = (): number => 0;

export function PresentationHostProvider({
  host,
  children,
}: {
  host?: PresentationHost;
  children: React.ReactNode;
}): React.ReactElement {
  return <PresentationHostContext.Provider value={host}>{children}</PresentationHostContext.Provider>;
}

export function usePresentationHost(): PresentationHost | undefined {
  const host = useContext(PresentationHostContext);
  useSyncExternalStore(host?.subscribe ?? noSubscription, host?.getRevision ?? noRevision, host?.getRevision ?? noRevision);
  return host;
}
