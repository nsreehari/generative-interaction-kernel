// BridgeComponent — the declarative successor to the workbench's native `CompositionBundle.Component`.
//
// The three workbench bridges (chrome->guest->inspect) were imperative only because the children were
// SEPARATE kernels: moving a value between two stores is I/O. A BridgeComponent supersedes them by
// holding the shared vars ITSELF — one kernel, one store, the children as regions of that store. Then
// every value that used to cross a bridge is intra-kernel `assign`/`derive`/`read` (pure), the "shared
// actions" are ordinary `on` handlers, and the only pieces that genuinely RUN an engine (a compiler, an
// interpreter) become named `invoke` tools the `machine` calls — fulfilled by the StepOrchestrator.
//
// So a composition is authored, not coded:
//   { children:[roles], manifest+document+seed:[the shared store & its wiring], machine:[the StepFlow] }
// The residue that cannot be pure data (running a program) is exactly the machine's `invoke` tools —
// not a hand-wired useEffect. Everything else is declarative over the one shared store.
//
// This core is framework-agnostic (kernel + StepOrchestrator only): a React/Reactor host renders each
// child role as a region over the single returned controller. Keeping it engine-agnostic honors the
// two-renderer promise (ADR-0029) — the composition is the same document on any renderer.

import {
  Kernel,
  InMemoryStateModel,
  unwrap,
  type DocumentMessage,
  type Enveloped,
  type ManifestPayload,
  type Json,
  type Patch,
  type GupEvent,
  type ResolvedNode,
} from "../../../kernel/src/index";
import { StepOrchestrator, type FlowRegistry } from "../../step-orchestrator/src/step-orchestrator";

/** A declarative composition: child roles bound over ONE shared store, driven by an optional machine. */
export interface BridgeComponentSpec {
  /** The child roles this composition binds (node ids of the regions it renders over the shared store). */
  children: string[];
  /** The shared kernel's vocabulary: the superseding store's namespaces + capabilities. */
  manifest: Enveloped<ManifestPayload>;
  /** The composition document: the child regions + the declarative wiring between them. */
  document: DocumentMessage;
  /** Seed values for the shared namespaces. */
  seed?: Record<string, Json>;
  /** The state machine: named `invoke` tools (compile, resolve, …) the document drives, run as flows. */
  machine?: FlowRegistry;
}

/** A mounted BridgeComponent: the one shared kernel plus the child roles rendered over it. */
export interface BridgeComponent {
  readonly children: readonly string[];
  readonly kernel: Kernel;
  init(): Patch;
  dispatch(event: GupEvent): Promise<Patch>;
  resolve(): Promise<ResolvedNode>;
  state(): Record<string, Json>;
}

/**
 * Stand up a BridgeComponent: seed ONE shared store, install the `machine` as the kernel's
 * orchestrator (so `invoke("tool")` runs the matching flow), and expose the shared kernel the child
 * regions render over. This replaces a native composition Component + its cross-kernel bridges with a
 * declared spec; only the machine's `invoke` tools remain irreducibly effectful (they run a program).
 */
export function createBridgeComponent(spec: BridgeComponentSpec): BridgeComponent {
  const namespaces = unwrap(spec.manifest).namespaces ?? [];
  const state = new InMemoryStateModel(namespaces);
  if (spec.seed) {
    state.apply(
      Object.entries(spec.seed).map(([ns, value]) => ({ op: "set" as const, path: ns, value }))
    );
  }
  const orchestrator = spec.machine ? new StepOrchestrator(spec.machine) : undefined;
  const kernel = new Kernel(
    spec.manifest,
    spec.document,
    orchestrator ? { state, orchestrator } : { state }
  );
  return {
    children: [...spec.children],
    kernel,
    init: () => kernel.init(),
    dispatch: (event) => kernel.dispatch(event),
    resolve: () => kernel.resolve(),
    state: () => kernel.state(),
  };
}
