// Core GIK types used by the reference kernel.

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

/** An immutable, rev-keyed capture of pure state for time-travel (see Kernel.checkpoint). */
export interface Checkpoint {
  rev: number;
  state: Record<string, Json>;
}

/**
 * A journaled effect, tagged with the rev it fired at and a monotonic issue sequence. The kernel
 * owns no wall-clock time (only the rev counter), so ordering is `rev` + `seq`, never a timestamp.
 * Returned by {@link Kernel.effectsSince} in causal order (oldest-first) for the host to ignore,
 * replay forward, or reverse for compensation — the kernel imposes no interpretation.
 */
export interface RecordedEffect {
  rev: number;
  seq: number;
  effect: OrchestratorEffect;
}

export interface GIKEvent {
  node: string;
  name: string;
  payload?: Record<string, Json>;
  actorId?: string;
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
  /** Run once when the initial value is non-null, for pre-seeded mailbox/request state. */
  runInitially?: boolean;
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

// An external effect requested by the reducer (invoke/route/confirm). The kernel
// hands these to the Orchestrator provider AFTER the pure reduction settles; the
// reducer itself never performs them, preserving the pure-reducer law.
export interface OrchestratorEffect {
  kind: "invoke" | "confirm" | "route";
  node: string;
  actorId?: string;
  tool?: string;
  to?: Json;
  args: Record<string, Json>;
  payload?: Record<string, Json>;
}

// What the Orchestrator returns: direct store deltas and/or follow-up events
// (e.g. a resolved async result driving a machine transition).
export interface OrchestratorResult {
  ops?: PatchOp[];
  events?: GIKEvent[];
  /** Semantic settlement recorded by observability (for example rejected or confirmation-required). */
  outcome?: string;
  /** Structured, serializable context for the settlement receipt. */
  detail?: Record<string, Json>;
}

/**
 * A projection-view import: binds a local alias to a projection-view provider, so a document can reference a
 * capability as `alias:name`. Nothing is ambient — even the shared floor must be imported. `use`
 * optionally restricts (and documents) the borrowed subset; omitted means the whole provider.
 */
export interface ProjectionViewImport {
  from: string; // provider name: "floor" | "self" | another bundle's name
  use?: string[]; // optional whitelist of capability names borrowed under this alias
}

/** A logical external-service contract required by an authored artifact. Physical providers,
 * endpoints, credentials, queues, and executor bindings are host-owned and never appear here. */
export type ServiceScope = "per-invocation" | "per-cell" | "per-blueprint" | "per-session";

/** Severity of a single guardrail rule: `"error"` blocks settlement and triggers `onViolation`;
 * `"warning"` is recorded on the settled result but never blocks. */
export type GuardrailLevel = "error" | "warning";

/** A single declarative guardrail rule authored as data. Mirrors the `@gik/evaluators` declarative
 * validator shape (the same engine already used for authored-input validation) so a Blueprint
 * author uses one vocabulary for both. `jsonata` evaluates a boolean expression against the
 * provider's output; `ajv-schema` checks output shape against a JSON Schema; `typedef` checks the
 * output's basic JS type. */
export type GuardrailRule =
  | readonly [string, string?]
  | {
      kind?: "jsonata";
      expr: string;
      message?: string;
      level?: GuardrailLevel;
      code?: string;
      node?: string;
    }
  | {
      kind: "ajv-schema";
      schema: Json;
      refs?: readonly { schema: Json; key?: string }[];
      message?: string;
      level?: GuardrailLevel;
      code?: string;
      node?: string;
    }
  | {
      kind: "typedef";
      type: string | readonly string[];
      message?: string;
      level?: GuardrailLevel;
      code?: string;
      node?: string;
    };

/** What the service host does when a response fails one or more `"error"`-level guardrails.
 * `maxAttempts` (where present) is always additionally capped by the host; a Blueprint cannot
 * author an unbounded call loop. */
export type GuardrailViolationAction =
  | { action: "fail" }
  | { action: "retry"; maxAttempts?: number }
  | { action: "correction-prompt"; maxAttempts?: number }
  | { action: "fallback" };

/** A Blueprint- or kind-authored output policy: the guardrails a service response must satisfy and
 * what to do when it doesn't. Resolved per operation, most-specific wins: a `ServiceUse.policyOverride`
 * beats a `ServiceDeclaration.operationPolicies` entry, which beats a service kind's own
 * `defaultOutputPolicy`. */
export interface ServiceOutputPolicy {
  guardrails?: readonly GuardrailRule[];
  onViolation?: GuardrailViolationAction;
}

export interface ServiceTransform {
  kind: "jsonata";
  expr: string;
}

export interface ServiceDataStage {
  transform?: ServiceTransform;
  validators?: readonly GuardrailRule[];
}

export interface ServiceSettlementStage {
  transform: ServiceTransform;
}

/** One Blueprint invocation backed by a configured service kind. The map key containing this
 * declaration is the document `invoke` tool name; `operation` is the provider operation. */
export interface ServiceOperationDeclaration {
  operation: string;
  contract: string;
  mode?: "immediate" | "queued";
  subject?: ServiceSubject;
  request?: ServiceDataStage;
  response?: ServiceDataStage;
  settlement: ServiceSettlementStage;
  onViolation?: GuardrailViolationAction;
}

export interface ServiceDeclaration {
  /** Host-registered executable kind, for example `copilot-agent` or `foundry-agent`. */
  kind: string;
  /** Contract version or compatible version range understood by the host's service resolver. */
  version: string;
  /** Blueprint invoke name -> complete declarative service operation. */
  operations: Record<string, ServiceOperationDeclaration>;
  /** Kind-specific, schema-validated configuration. Literal credentials are forbidden. */
  config?: Json;
  /** Provider-native adapter/session reuse policy. */
  scope?: ServiceScope;
}

/** @deprecated Migration shape for operation-only manifests created before service kinds. */
export interface ServiceRequirement {
  version: string;
  operations: string[];
  kind?: string;
  config?: Json;
  scope?: ServiceScope;
}

export type ServiceUse = {
  operation: string;
  contract: string;
  /** Overrides the resolved guardrail/output policy for this single call site only. */
  policyOverride?: Partial<ServiceOutputPolicy>;
} & (
  | { service: string; inline?: never }
  | { service?: never; inline: ServiceDeclaration }
);

export type ServiceSubject =
  | { kind: "cell"; blueprintId: string; cellId: string }
  | { kind: "substrate-agent"; blueprintId: string; actorId: string }
  | { kind: "chat"; blueprintId: string; turnId: string }
  | { kind: "task"; blueprintId: string; taskId: string };

/**
 * The bundle's outward dependency contract: everything it needs from the host to run. Grouping
 * these in one place makes the "what does this bundle require?" question answerable by reading a
 * single object (rather than inferring effects from the document tree or hunting for imports).
 */
export interface ExternalsSpec {
  /** Alias -> projection-view provider binding. A capability is referenced as `alias:name`. */
  projectionViews?: Record<string, ProjectionViewImport>;
  /** Names of effect handlers the host must supply for this bundle's `invoke` actions. */
  effectHandlers?: string[];
  /** Logical service requirements resolved to provider adapters by the outer host. */
  services?: Record<string, ServiceRequirement | ServiceDeclaration>;
}

export interface ManifestPayload {
  version: string;
  expression?: string;
  namespaces?: string[];
  /**
   * Namespace roots that are *shared context* rather than local state (ADR-0034): a host binds each
   * to a shared StateModel (a context provider), and read/assign/derive whose path targets one route
   * to that shared store. Declaring them as data keeps the sharing portable — the adapter realizes it
   * as a React Context / Reactor `Context`, but the document/manifest stays host-neutral.
   */
  contexts?: string[];
  actions?: string[];
  capabilities: Record<string, CapabilityDescriptor>;
  /** Outward dependency contract: imported components, effect handlers, and logical services. */
  externals?: ExternalsSpec;
}

export interface TraceEvent {
  event: "resolve" | "fallback" | "action" | "transition" | "validate" | "effect";
  node?: string;
  detail?: Record<string, unknown>;
  ts?: number;
}

export type TraceSink = (t: TraceEvent) => void;

export const GIK_VERSION = "0.1";

export interface ManifestMessage {
  gik: typeof GIK_VERSION;
  type: "manifest";
  payload: ManifestPayload;
}

export interface DocumentMessage {
  gik: typeof GIK_VERSION;
  type: "document";
  payload: DocumentPayload;
}

export interface PatchMessage {
  gik: typeof GIK_VERSION;
  type: "patch";
  payload: Patch;
}

export interface EventMessage {
  gik: typeof GIK_VERSION;
  type: "event";
  payload: GIKEvent;
}

export interface TraceMessage {
  gik: typeof GIK_VERSION;
  type: "trace";
  payload: TraceEvent;
}

export type GIKMessage =
  | ManifestMessage
  | DocumentMessage
  | PatchMessage
  | EventMessage
  | TraceMessage;

export function envelope<TType extends GIKMessage["type"], TPayload>(
  type: TType,
  payload: TPayload
): { gik: typeof GIK_VERSION; type: TType; payload: TPayload } {
  return { gik: GIK_VERSION, type, payload };
}

export interface ResolvedNode {
  capability: string;
  id: string;
  props: Record<string, Json>;
  visible: boolean;
  fallback: boolean;
  children: ResolvedNode[];
}

// A GIK envelope { gik, type, payload } or a bare payload.
export type Enveloped<T> = T | { gik: string; type: string; payload: T };

export function unwrap<T>(m: Enveloped<T>): T {
  return m && typeof m === "object" && "payload" in (m as object)
    ? ((m as { payload: T }).payload)
    : (m as T);
}
