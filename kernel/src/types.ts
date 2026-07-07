// Core GUP types used by the reference kernel.

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [k: string]: Json };

export interface PatchOp {
  op: "set" | "merge" | "remove";
  path: string;
  value?: Json;
}

export interface Patch {
  rev: number;
  ops: PatchOp[];
}

export interface GupEvent {
  node: string;
  name: string;
  payload?: Record<string, Json>;
}

export interface Action {
  do: string;
  target?: string;
  args?: Record<string, Json>;
  guard?: string;
  event?: string;
}

/**
 * A declarative reaction: a standing, state-triggered effect. When {@link when}'s value changes, the
 * kernel runs {@link run} (the closed-grammar actions) as a synthetic dispatch owned by the node — the
 * standing analogue of an event handler (`on`). Pure standing derivations stay `computed`; a reaction is
 * for genuinely effectful bodies (`invoke`) or cross-cell writes.
 */
export interface Reaction {
  /** Expression over state; the reaction fires when its evaluated value changes. */
  when: string;
  /** Closed-grammar actions to run on change. */
  run: Action[];
}

export interface Edges {
  read?: Record<string, string>;
  /**
   * prop -> expression (data in, shaped). Like {@link read} but the value is the result of
   * evaluating the manifest-declared expression against the state snapshot, so an authored
   * document can project / filter / sort an array into the exact shape a capability wants
   * (e.g. `workbench.facets.{ "name": name, "tag": required ? "required" : "optional" }`)
   * instead of a host reshaping it imperatively. A value position, so it runs on the full
   * provider (like derive / assign-from), not the safe predicate subset.
   */
  readExpr?: Record<string, string>;
  gate?: string;
  write?: Record<string, { to: string }>;
  on?: Record<string, Action[]>;
  /** Standing reactions: state-triggered effects that run when their `when` value changes. */
  react?: Reaction[];
  children?: DocNode[];
}

export interface DocNode {
  capability: string;
  id: string;
  props?: Record<string, Json>;
  edges?: Edges;
}

export interface Transition {
  target: string;
  guard?: string;
  actions?: Action[];
}

export interface MachineState {
  on?: Record<string, string | Transition>;
  entry?: Action[];
  exit?: Action[];
  type?: "final";
}

export interface Machine {
  id: string;
  context: string;
  initial: string;
  states: Record<string, MachineState>;
}

export interface DocumentPayload {
  manifest?: string;
  root: DocNode;
  machines?: Machine[];
}

export interface CapabilityDescriptor {
  propsSchema?: object;
  emits?: string[];
  slots?: string[];
  // Which prop receives bound data from a read edge (e.g. metric -> "value", table -> "rows").
  // The presentation compiler consults this so binding is generic per capability; defaults to "value".
  dataProp?: string;
}

// An external effect requested by the reducer (invoke/navigate/confirm). The kernel
// hands these to the Orchestrator provider AFTER the pure reduction settles; the
// reducer itself never performs them, preserving the pure-reducer law.
export interface OrchestratorEffect {
  kind: "invoke" | "confirm" | "navigate";
  node: string;
  tool?: string;
  to?: Json;
  args: Record<string, Json>;
  payload?: Record<string, Json>;
}

// What the Orchestrator returns: direct store deltas and/or follow-up events
// (e.g. a resolved async result driving a machine transition).
export interface OrchestratorResult {
  ops?: PatchOp[];
  events?: GupEvent[];
}

/**
 * A component import: binds a local alias to a component provider, so a document can reference a
 * capability as `alias:name`. Nothing is ambient — even the shared floor must be imported. `use`
 * optionally restricts (and documents) the borrowed subset; omitted means the whole provider.
 */
export interface ComponentImport {
  from: string; // provider name: "floor" | "self" | another bundle's name
  use?: string[]; // optional whitelist of capability names borrowed under this alias
}

/**
 * The bundle's outward dependency contract: everything it needs from the host to run. Grouping
 * these in one place makes the "what does this bundle require?" question answerable by reading a
 * single object (rather than inferring effects from the document tree or hunting for imports).
 */
export interface ExternalsSpec {
  /** Alias -> component provider binding. A capability is referenced as `alias:name`. */
  components?: Record<string, ComponentImport>;
  /** Names of effect handlers the host must supply for this bundle's `invoke` actions. */
  effects?: string[];
}

export interface ManifestPayload {
  version: string;
  expression?: string;
  namespaces?: string[];
  actions?: string[];
  capabilities: Record<string, CapabilityDescriptor>;
  /** Outward dependency contract: imported component providers + required external effect handlers. */
  externals?: ExternalsSpec;
}

export interface TraceEvent {
  event: "resolve" | "fallback" | "action" | "transition" | "validate" | "effect";
  node?: string;
  detail?: Record<string, unknown>;
  ts?: number;
}

export type TraceSink = (t: TraceEvent) => void;

export const GUP_VERSION = "0.1";

export interface ManifestMessage {
  gup: typeof GUP_VERSION;
  type: "manifest";
  payload: ManifestPayload;
}

export interface DocumentMessage {
  gup: typeof GUP_VERSION;
  type: "document";
  payload: DocumentPayload;
}

export interface PatchMessage {
  gup: typeof GUP_VERSION;
  type: "patch";
  payload: Patch;
}

export interface EventMessage {
  gup: typeof GUP_VERSION;
  type: "event";
  payload: GupEvent;
}

export interface TraceMessage {
  gup: typeof GUP_VERSION;
  type: "trace";
  payload: TraceEvent;
}

export type GupMessage =
  | ManifestMessage
  | DocumentMessage
  | PatchMessage
  | EventMessage
  | TraceMessage;

export function envelope<TType extends GupMessage["type"], TPayload>(
  type: TType,
  payload: TPayload
): { gup: typeof GUP_VERSION; type: TType; payload: TPayload } {
  return { gup: GUP_VERSION, type, payload };
}

export interface ResolvedNode {
  capability: string;
  id: string;
  props: Record<string, Json>;
  visible: boolean;
  fallback: boolean;
  children: ResolvedNode[];
}

// A GUP envelope { gup, type, payload } or a bare payload.
export type Enveloped<T> = T | { gup: string; type: string; payload: T };

export function unwrap<T>(m: Enveloped<T>): T {
  return m && typeof m === "object" && "payload" in (m as object)
    ? ((m as { payload: T }).payload)
    : (m as T);
}
