// SharedComposition — the declarative successor to the workbench's native `CompositionBundle.Component`.
//
// The three workbench bridges (chrome->guest->inspect) were imperative ONLY because the children were
// SEPARATE kernels: moving a value between two stores is I/O. A SharedComposition supersedes them by
// holding the shared vars ITSELF — one kernel, one store, the children as regions of that store. Once
// they are regions of one store the "bridge" is not effectful at all: chrome writes `n` upstream, the
// shared cell `tree` is a pure derivation of `n`, and inspect just reads `tree`. There is no async, no
// I/O, no tool to run — so there is NO orchestrator here. The projection is a standing JSONata
// `computed` maintained by the reactive store (it must run AFTER the assign op lands, which a
// same-handler `derive` cannot — the reducer evaluates against the pre-assign snapshot).
//
// Everything a SharedComposition needs is therefore pure data:
//   { children:[roles], manifest, document, seed?, computed? }   — fully serializable JSON.
// `invoke`/tools/StepMachine are an ORTHOGONAL capability for the genuinely effectful case (call an
// LLM, hit an API, run a host compiler) — JSONata can't express those. They are NOT part of this
// story; a composition that needs them attaches a StepOrchestrator separately.
//
// This core is framework-agnostic (kernel + store only): a React/Reactor host renders each child role
// as a region over the single returned controller, honoring the two-renderer promise (ADR-0029).

import {
  Kernel,
  InMemoryStateModel,
  JsonataExpressionProvider,
  unwrap,
  type DocumentMessage,
  type Enveloped,
  type ManifestPayload,
  type Json,
  type Patch,
  type GupEvent,
  type ResolvedNode,
} from "../../../kernel/src/index";
import { ReactiveStateModel } from "../../reactive-state-model/src/reactive-state-model";

/** A declarative composition: child roles bound over ONE shared store, with optional standing derivations. */
export interface SharedCompositionSpec {
  /** The child roles this composition binds (node ids of the regions it renders over the shared store). */
  children: string[];
  /** The shared kernel's vocabulary: the superseding store's namespaces + capabilities. */
  manifest: Enveloped<ManifestPayload>;
  /** The composition document: the child regions + the declarative wiring between them. */
  document: DocumentMessage;
  /** Seed values for the shared namespaces. */
  seed?: Record<string, Json>;
  /**
   * Standing JSONata derivations over the shared store: cell -> expression (e.g. `{ tree: "n * 2" }`).
   * Dependencies are inferred from each expression and the reactive store maintains the cascade — the
   * pure, no-I/O way one region's value flows from another's. Absent = a plain shared-store binding.
   */
  computed?: Record<string, string>;
}

/** A mounted SharedComposition: the one shared kernel plus the child roles rendered over it. */
export interface SharedComposition {
  readonly children: readonly string[];
  readonly kernel: Kernel;
  init(): Patch;
  dispatch(event: GupEvent): Promise<Patch>;
  resolve(): Promise<ResolvedNode>;
  state(): Record<string, Json>;
  /** Await the reactive `computed` cascade to quiesce (no-op when there are no computed cells). */
  settle(): Promise<void>;
  /** Release the reactive store's resources (no-op when there are no computed cells). */
  dispose(): Promise<void>;
}

/**
 * Stand up a SharedComposition: build ONE shared store (reactive when `computed` derivations are
 * declared, plain otherwise), seed it, and expose the shared kernel the child regions render over.
 * This replaces a native composition Component + its cross-kernel bridges with a spec that is entirely
 * data — because, collapsed onto one store, the bridges are pure derivations, not effects.
 */
export function createSharedComposition(spec: SharedCompositionSpec): SharedComposition {
  const seed = spec.seed ?? {};
  const hasComputed = spec.computed !== undefined && Object.keys(spec.computed).length > 0;

  let state: InMemoryStateModel | ReactiveStateModel;
  let settle: () => Promise<void>;
  let dispose: () => Promise<void>;

  if (hasComputed) {
    const provider = new JsonataExpressionProvider();
    const evaluate = (expr: string, scope: Record<string, unknown>) => provider.eval(expr, scope);
    const store = ReactiveStateModel.fromComputed(spec.computed!, { evaluate, initial: seed });
    state = store;
    settle = () => store.settle();
    dispose = () => store.dispose();
  } else {
    const namespaces = unwrap(spec.manifest).namespaces ?? [];
    const store = new InMemoryStateModel(namespaces);
    const seedEntries = Object.entries(seed);
    if (seedEntries.length > 0) {
      store.apply(seedEntries.map(([path, value]) => ({ op: "set" as const, path, value })));
    }
    state = store;
    settle = async () => {};
    dispose = async () => {};
  }

  const kernel = new Kernel(spec.manifest, spec.document, { state });
  return {
    children: [...spec.children],
    kernel,
    init: () => kernel.init(),
    dispatch: (event) => kernel.dispatch(event),
    resolve: () => kernel.resolve(),
    state: () => kernel.state(),
    settle,
    dispose,
  };
}
