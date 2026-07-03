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

export interface Edges {
  read?: Record<string, string>;
  gate?: string;
  write?: Record<string, { to: string }>;
  on?: Record<string, Action[]>;
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

export interface ManifestPayload {
  version: string;
  expression?: string;
  namespaces?: string[];
  actions?: string[];
  capabilities: Record<string, CapabilityDescriptor>;
}

export interface TraceEvent {
  event: "resolve" | "fallback" | "action" | "transition" | "validate" | "effect";
  node?: string;
  detail?: Record<string, unknown>;
  ts?: number;
}

export type TraceSink = (t: TraceEvent) => void;

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
