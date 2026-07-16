// SharedContextStore — the React adapter's realization of an ADR-0034 context provider.
//
// A context is a namespace backed by a StateModel that several independently-mounted kernels bind to
// (via the kernel `contexts` option), so they share one source of truth. The kernel is pull-based:
// when one runtime writes the shared store, a sibling that only *reads* it has no reason to re-resolve.
// This store closes that gap for a reactive host — it wraps a plain StateModel and notifies subscribers
// after every write, so a host can re-`resync()` the sibling runtimes that read the context. It is the
// portable stand-in for a React `Context` / Reactor `Context`: the declaration stays data, this is the
// runtime that drives re-render under it.

import { InMemoryStateModel, type Json, type PatchOp, type StateModel } from "@gik/kernel";

export class SharedContextStore implements StateModel {
  private readonly listeners = new Set<() => void>();

  private constructor(private readonly inner: StateModel) {}

  /** A fresh shared store seeded with the given context namespace roots. */
  static create(namespaces: string[] = []): SharedContextStore {
    return new SharedContextStore(new InMemoryStateModel(namespaces));
  }

  /** Wrap an existing StateModel (e.g. a reactive `computed`-backed store) with change notification. */
  static wrap(inner: StateModel): SharedContextStore {
    return new SharedContextStore(inner);
  }

  snapshot(): Record<string, Json> {
    return this.inner.snapshot();
  }

  get(path: string): Json {
    return this.inner.get(path);
  }

  apply(ops: PatchOp[]): void {
    this.inner.apply(ops);
    if (ops.length > 0) for (const listener of [...this.listeners]) listener();
  }

  /** Called after any write. Hosts use it to re-resolve sibling runtimes that read this context. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
