// SharedComposition — the declarative successor to the workbench's native `CompositionBundle.Component`.
//
// The three workbench bridges (chrome->guest->inspect) were imperative only because the children were
// SEPARATE kernels: moving a value between two stores is I/O. A SharedComposition supersedes them by
// holding the shared vars ITSELF — one kernel, one store, the children as regions of that store. Then
// every value that used to cross a bridge is intra-kernel `assign`/`derive`/`read` (pure), the "shared
// actions" are ordinary `on` handlers, and the only pieces that genuinely RUN an engine (a compiler, an
// interpreter) become named `invoke` tools the machine calls — fulfilled by the StepOrchestrator.
//
// The spec splits along the neutral/native seam (ADR-0032):
//   - NEUTRAL (JSON, authorable):  children, manifest, document, state, and the tools' `flows`
//     (StepFlowConfig — the declarative *structure* of each tool: steps, transitions, terminals).
//   - NATIVE (injected code):      each tool's `handlers` (the actual side-effecting step bodies).
// `loadSharedComposition(json, native)` recombines the two — exactly like `bundleFromJson(json, native)`.
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
import {
  StepOrchestrator,
  type FlowRegistry,
  type FlowRegistration,
} from "../../step-orchestrator/src/step-orchestrator";
import type { StepFlowConfig } from "../../vendor/step-machine/index.js";

/** A declarative composition: child roles bound over ONE shared store, driven by an optional machine. */
export interface SharedCompositionSpec {
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

/** A mounted SharedComposition: the one shared kernel plus the child roles rendered over it. */
export interface SharedComposition {
  readonly children: readonly string[];
  readonly kernel: Kernel;
  init(): Patch;
  dispatch(event: GupEvent): Promise<Patch>;
  resolve(): Promise<ResolvedNode>;
  state(): Record<string, Json>;
}

/**
 * Stand up a SharedComposition: seed ONE shared store, install the `machine` as the kernel's
 * orchestrator (so `invoke("tool")` runs the matching flow), and expose the shared kernel the child
 * regions render over. This replaces a native composition Component + its cross-kernel bridges with a
 * declared spec; only the machine's `invoke` tools remain irreducibly effectful (they run a program).
 */
export function createSharedComposition(spec: SharedCompositionSpec): SharedComposition {
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

// --- The neutral/native JSON boundary --------------------------------------------------

/**
 * The JSON-only part of a shared composition — safe to author, store, and ship as data. The manifest,
 * document and state are the usual neutral trio; `flows` adds each tool's declarative STRUCTURE (a
 * `StepFlowConfig`: steps, transitions, terminals). What is NOT here is each step's *body* — that is
 * native effect code (I/O), supplied at load via {@link SharedCompositionNative}.
 */
export interface SerializableSharedComposition {
  children: string[];
  manifest: Enveloped<ManifestPayload>;
  document: DocumentMessage;
  state?: Record<string, Json>;
  /** Per-tool declarative flow structure, keyed by the `tool` name an `invoke` action targets. */
  flows?: Record<string, StepFlowConfig>;
}

/** One tool's native side: its step handlers plus optional durability / result shaping (no `flow`). */
export type ToolImpl = Omit<FlowRegistration, "flow">;

/** The native code a shared composition attaches at load: each tool's handlers (the effect bodies). */
export interface SharedCompositionNative {
  /** tool name -> its native implementation (`handlers`, optional `store`/`onResult`). */
  tools?: Record<string, ToolImpl>;
}

/**
 * The "everything-is-JSON" entry point: recombine a neutral composition (children/manifest/document/
 * state/flows) with the native step handlers into a runnable SharedComposition. Mirrors
 * `bundleFromJson` — the structure is authored data, only the effect bodies are code.
 *
 * This is a system boundary, so the flows and their handlers must match: a flow with no handlers (or
 * handlers with no flow) throws here rather than failing deep inside a run.
 */
export function loadSharedComposition(
  json: SerializableSharedComposition,
  native: SharedCompositionNative = {}
): SharedComposition {
  const flows = json.flows ?? {};
  const tools = native.tools ?? {};
  const toolNames = new Set([...Object.keys(flows), ...Object.keys(tools)]);

  let machine: FlowRegistry | undefined;
  if (toolNames.size > 0) {
    machine = {};
    for (const tool of toolNames) {
      const flow = flows[tool];
      const impl = tools[tool];
      if (!flow) throw new Error(`loadSharedComposition: tool "${tool}" has a native impl but no declared flow`);
      if (!impl) throw new Error(`loadSharedComposition: flow "${tool}" has no native handlers supplied`);
      machine[tool] = { flow, ...impl };
    }
  }

  return createSharedComposition({
    children: json.children,
    manifest: json.manifest,
    document: json.document,
    seed: json.state,
    machine,
  });
}
