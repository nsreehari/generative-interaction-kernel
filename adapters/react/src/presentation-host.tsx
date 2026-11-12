import React, { useContext, useSyncExternalStore } from "react";
import type { Json, ResolvedNode } from "gik-kernel";
import type { EmitFn } from "./render";
export type PresentationEventBinding =
  | {
    attention: { channel: string; set: { from: string }; clear?: never }
      | { channel: string; clear: true; set?: never };
    effect?: never;
    event?: never;
  }
  | { effect: string; attention?: never; event?: never }
  | { event: { node: string; name: string }; attention?: never; effect?: never };

export interface PresentationBinding {
  props?: Readonly<Record<string, { attention: string }>>;
  on?: Readonly<Record<string, PresentationEventBinding>>;
}

export interface PresentationHostSnapshot {
  readonly attention: Readonly<Record<string, Json>>;
}

export interface PresentationEffectContext {
  readonly node: Readonly<{ id: string; capability: string }>;
  readonly event: string;
  readonly actorId?: string;
}

export interface PresentationEffect<Input = unknown> {
  parseInput(payload: Readonly<Record<string, Json>>): Input;
  authorize(context: PresentationEffectContext, input: Input): boolean | Promise<boolean>;
  handle(context: PresentationEffectContext, input: Input): void | Promise<void>;
}

/** Preserve the parsed input type while declaring a provider's heterogeneous effects. */
export function definePresentationEffect<Input>(effect: PresentationEffect<Input>): PresentationEffect<Input> {
  return Object.freeze({
    parseInput: effect.parseInput.bind(effect),
    authorize: effect.authorize.bind(effect),
    handle: effect.handle.bind(effect),
  });
}

export interface PresentationEffectProvider {
  id: string;
  effects: Readonly<Record<string, PresentationEffect>>;
}

export interface PresentationHostOptions {
  /** Transient coordination channels owned by this rendering host. */
  attention?: readonly string[];
  bindings?: Readonly<Record<string, PresentationBinding>>;
  /** Explicitly admitted effect names, grouped by provider id. Default: admit none. */
  effects?: Readonly<Record<string, readonly string[]>>;
}

function assertJson(value: unknown, ancestors = new Set<object>()): asserts value is Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || ancestors.has(value)
    || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error("Presentation effect data must contain only JSON values");
  }
  ancestors.add(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) assertJson(child, ancestors);
  ancestors.delete(value);
}

/** Rendering-local coordination; never a Blueprint execution context or semantic effect dispatcher. */
export class PresentationHost {
  private readonly channels: ReadonlySet<string>;
  private readonly attention = new Map<string, { owner: string; value: Json }>();
  private readonly bindings: ReadonlyMap<string, PresentationBinding>;
  private readonly admitted: ReadonlyMap<string, ReadonlySet<string>>;
  private readonly providers = new Map<string, ReadonlyMap<string, PresentationEffect>>();
  private readonly listeners = new Set<() => void>();
  private revision = 0;

  constructor(options: PresentationHostOptions = {}) {
    this.channels = new Set(options.attention ?? []);
    this.bindings = new Map(Object.entries(structuredClone(options.bindings ?? {})));
    this.admitted = new Map(Object.entries(options.effects ?? {}).map(([id, names]) => [id, new Set(names)]));
    for (const binding of this.bindings.values()) {
      for (const prop of Object.values(binding.props ?? {})) this.assertChannel(prop.attention);
      for (const event of Object.values(binding.on ?? {})) {
        if (event.attention) this.assertChannel(event.attention.channel);
      }
    }
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  readonly getRevision = (): number => this.revision;

  getState(): PresentationHostSnapshot {
    return { attention: Object.fromEntries([...this.channels].map((channel) => [channel, this.readAttention(channel)])) };
  }

  setAttention(channel: string, owner: string, value: Json): void {
    this.assertChannel(channel);
    if (!owner) throw new Error("Presentation attention requires an owner");
    assertJson(value);
    this.attention.set(channel, { owner, value: structuredClone(value) });
    this.notify();
  }

  clearAttention(channel: string, owner: string): void {
    this.assertChannel(channel);
    if (this.attention.get(channel)?.owner !== owner) return;
    this.attention.delete(channel);
    this.notify();
  }

  release(owner: string): void {
    let changed = false;
    for (const [channel, entry] of this.attention) {
      if (entry.owner === owner) changed = this.attention.delete(channel) || changed;
    }
    if (changed) this.notify();
  }

  private assertChannel(channel: string): void {
    if (!this.channels.has(channel)) throw new Error(`Presentation attention channel '${channel}' is not declared`);
  }

  private readAttention(channel: string): Json {
    return structuredClone(this.attention.get(channel)?.value ?? null);
  }

  private notify(): void {
    this.revision += 1;
    for (const listener of [...this.listeners]) listener();
  }

  registerProvider(provider: PresentationEffectProvider): () => void {
    const id = provider.id;
    if (!/^[^:\s]+$/.test(id)) throw new Error("Presentation provider requires a nonempty id without colons");
    if (this.providers.has(id)) throw new Error(`Presentation provider '${id}' is already registered`);
    const admitted = this.admitted.get(id);
    if (!admitted) throw new Error(`Presentation provider '${id}' is not admitted`);
    const effects = new Map(Object.entries(provider.effects));
    for (const [name, effect] of effects) {
      if (!/^[^:\s]+$/.test(name)
        || typeof effect.parseInput !== "function" || typeof effect.authorize !== "function" || typeof effect.handle !== "function") {
        throw new Error(`Presentation effect '${id}:${name}' requires a name, input parser, authorization, and handler`);
      }
    }
    for (const name of admitted) {
      if (!effects.has(name)) throw new Error(`Admitted presentation effect '${id}:${name}' is not declared`);
    }
    this.providers.set(id, new Map([...effects].map(([name, effect]) => [name, definePresentationEffect(effect)])));
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.providers.delete(id);
    };
  }

  project(node: ResolvedNode): ResolvedNode {
    const bindings = this.bindings.get(node.capability)?.props;
    if (!bindings) return node;
    return {
      ...node,
      props: {
        ...node.props,
        ...Object.fromEntries(Object.entries(bindings).map(([prop, binding]) => {
          return [prop, this.readAttention(binding.attention)];
        })),
      },
    };
  }

  async emit(
    emit: EmitFn,
    node: ResolvedNode,
    name: string,
    payload?: Record<string, unknown>,
    actorId?: string,
  ): Promise<unknown> {
    const handlers = this.bindings.get(node.capability)?.on;
    const binding = handlers && Object.hasOwn(handlers, name) ? handlers[name] : undefined;
    if (!binding) return emit(node.id, name, payload, actorId);
    if (binding.event) return emit(binding.event.node, binding.event.name, payload, actorId);
    const data = payload ?? {};
    assertJson(data);
    if (binding.attention) {
      const action = binding.attention;
      if (action.set) {
        if (!Object.hasOwn(data, action.set.from)) throw new Error(`Missing attention input '${action.set.from}'`);
        this.setAttention(action.channel, node.id, data[action.set.from]);
      } else {
        this.clearAttention(action.channel, node.id);
      }
      return;
    }
    const parts = binding.effect.split(":");
    if (parts.length !== 2 || !this.admitted.get(parts[0])?.has(parts[1])) {
      throw new Error(`Presentation effect '${binding.effect}' is not admitted`);
    }
    const effect = this.providers.get(parts[0])?.get(parts[1]);
    if (!effect) throw new Error(`Presentation effect '${binding.effect}' is not registered`);
    const context: PresentationEffectContext = Object.freeze({
      node: Object.freeze({ id: node.id, capability: node.capability }), event: name, actorId,
    });
    const input = effect.parseInput(structuredClone(data));
    if (await effect.authorize(context, input) !== true) throw new Error(`Presentation effect '${binding.effect}' is not authorized`);
    const result = await effect.handle(context, input);
    if (result !== undefined) throw new Error("Presentation effects must not return semantic results; use an explicit Cell event");
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
