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
  /** Internal action consequences already settled during this run; hosts must not replay them. */
  completedWithinRun?: CompletedWithinRun[];
  /** A validated structural update to the live executable program at this revision. */
  program?: ProgramPatch;
}

/** An immutable, rev-keyed capture for time-travel (see Kernel.checkpoint). */
export interface Checkpoint {
  rev: number;
  state: Record<string, Json>;
  /** Present when the caller requests an adaptive-program checkpoint. */
  program?: ExecutableProgramDefinition;
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
  invocationId?: InvocationId;
}

export interface GIKEvent {
  node: string;
  name: string;
  payload?: Record<string, Json>;
  actorId?: string;
}

export type PortToken = string;
export type PortMode = "value" | "signal" | "stream";

export interface PortDefinition {
  mode?: PortMode;
  producers?: "single" | "many";
}

export interface InputPort {
  token: PortToken;
  optional?: boolean;
}

export interface OutputPort {
  token: PortToken;
  mode?: PortMode;
}

export type NodeTrigger =
  | { startup: true }
  | { event: string; node?: string };

export interface ComputeNodeOperation {
  kind: "compute";
  expression: string;
}

export interface ActionsNodeOperation {
  kind: "actions";
  actions: Action[];
}

export interface InvokeNodeOperation {
  kind: "invoke";
  tool: string;
  arguments?: Record<string, string>;
}

export interface DecisionCase {
  when: string;
  outputs?: Record<string, string>;
}

export interface DecisionNodeOperation {
  kind: "decision";
  cases: DecisionCase[];
}

export interface ExtensionNodeOperation {
  kind: "extension";
  name: string;
  config?: Json;
}

export type NodeOperation =
  | ComputeNodeOperation
  | ActionsNodeOperation
  | InvokeNodeOperation
  | DecisionNodeOperation
  | ExtensionNodeOperation;

export interface ProgramNode {
  id: string;
  inputs?: Record<string, PortToken | InputPort>;
  outputs?: Record<string, PortToken | OutputPort>;
  trigger?: NodeTrigger;
  when?: string;
  operation: NodeOperation;
}

export interface ProgramGraph {
  inputs?: PortToken[];
  outputs?: PortToken[];
  ports?: Record<PortToken, PortDefinition>;
  nodes: ProgramNode[];
}

export interface TokenRuntimeState {
  status: "absent" | "available";
  value?: Json;
  version: number;
  producedBy?: string;
}

export type GraphNodeStatus = "idle" | "ready" | "running" | "suspended" | "failed";

export interface GraphNodeRuntimeState {
  status: GraphNodeStatus;
  consumedVersions: Record<PortToken, number>;
  invocationId?: InvocationId;
  failure?: Json;
}

export type ExecutionStatus = "quiescent" | "suspended" | "completed" | "yielded" | "failed";

export interface ExecutionBudget {
  maxNodeExecutions?: number;
  maxPublications?: number;
}

export interface GraphExecutionResult {
  status: ExecutionStatus;
  publications: Record<PortToken, Json>;
  operations: PatchOp[];
  effects: OrchestratorEffect[];
  events: GIKEvent[];
  program?: ProgramPatch;
  readyNodes: string[];
  nodeExecutions: number;
  publicationCount: number;
}

export interface GraphNodeExecutionOutcome {
  outputs?: Record<string, Json>;
  operations?: PatchOp[];
  effects?: OrchestratorEffect[];
  events?: GIKEvent[];
  program?: ProgramPatch;
  suspended?: boolean;
}

export interface ExecutionSnapshot {
  topologyVersion: number;
  status: ExecutionStatus;
  tokens: Record<PortToken, TokenRuntimeState>;
  nodes: Record<string, GraphNodeRuntimeState>;
  readyNodes: string[];
  runningInvocations: InvocationId[];
}

export interface TransitionResult {
  previousRevision: number;
  revision: number;
  status: ExecutionStatus;
  state: Record<string, Json>;
  patch: Patch;
  program?: ProgramPatch;
  effects: RecordedEffect[];
  completedWithinRun?: CompletedWithinRun[];
  execution: ExecutionSnapshot;
}

export interface GraphDiagnostic {
  kind: "unproduced-token" | "unused-token" | "feedback-component";
  token?: PortToken;
  nodes?: string[];
}

export interface GraphInspection {
  topologyVersion: number;
  diagnostics: GraphDiagnostic[];
}

export type GraphMutation =
  | { op: "addNode"; node: ProgramNode }
  | { op: "removeNode"; nodeId: string }
  | { op: "replaceNode"; nodeId: string; node: ProgramNode }
  | { op: "addPort"; token: PortToken; definition?: PortDefinition }
  | { op: "removePort"; token: PortToken }
  | { op: "updatePort"; token: PortToken; definition: PortDefinition };

/** One typed operation against the current executable program. */
export type ProgramPatchOperation =
  | { op: "mutateGraph"; mutations: readonly GraphMutation[] }
  | { op: "setGraph"; graph: ProgramGraph }
  | { op: "removeGraph" }
  | { op: "setRoot"; root: DocNode }
  | { op: "removeRoot" }
  | { op: "upsertHandler"; handler: RuntimeHandler }
  | { op: "removeHandler"; id: string }
  | { op: "upsertMachine"; machine: Machine }
  | { op: "removeMachine"; id: string }
  | { op: "upsertDerivation"; derivation: StandingDerivation }
  | { op: "removeDerivation"; id: string };

/** Ordered patch operations applied to one existing executable program. */
export type ProgramPatch = readonly ProgramPatchOperation[];

export interface AssignAction {
  do: "assign";
  target: string;
  args: { value: Json; from?: never } | { from: string; value?: never };
  guard?: string;
}

export interface EmitAction {
  do: "emit";
  event: string;
  data?: Record<string, Json>;
  guard?: string;
}

export interface InvokeControl {
  tool: string;
  serviceRef?: string;
  responseSchema?: Record<string, Json>;
  sourceId?: string;
  sourceCellId?: string;
  sourceRequestToken?: string;
  sourceInputs?: Record<string, Json>;
  sourceInputTransform?: ServiceTransform;
  sourceOutputTransform?: ServiceTransform;
  /** Extra per-usage-site guardrails a Cell source declares on top of the operation's own
   * `response.validators`, gated by the same operation `onViolation` policy. */
  sourceAcceptanceCriteria?: readonly GuardrailRule[];
}

export interface RouteControl {
  to: Json;
}

export interface RequestControl {
  kind: "decision" | "clarification" | "data";
  responseSchema: Record<string, Json>;
  policy?: string;
  timeoutMs?: number;
}

export interface InvokeAction {
  do: "invoke";
  control: InvokeControl;
  data?: Record<string, Json>;
  guard?: string;
}

export interface RouteAction {
  do: "route";
  control: RouteControl;
  data?: Record<string, Json>;
  guard?: string;
}

export interface RequestAction {
  do: "request";
  control: RequestControl;
  data: Record<string, Json>;
  args?: { from: string };
  guard?: string;
}

export type Action = AssignAction | EmitAction | InvokeAction | RouteAction | RequestAction;

export type CompletedWithinRun =
  | { kind: "assign"; node: string; target: string; value: Json }
  | { kind: "emit"; node: string; event: GIKEvent };

export interface Edges {
  read?: Record<string, string>;
  /**
   * prop -> expression (data in, shaped). Like {@link read} but the value is the result of
   * evaluating the manifest-declared expression against the state snapshot, so an authored
   * document can project / filter / sort an array into the exact shape a capability wants
  * (e.g. `sample.facets.{ "name": name, "tag": required ? "required" : "optional" }`)
   * instead of a host reshaping it imperatively. A value position, so it runs on the full
   * provider (like derive / assign-from), not the safe predicate subset.
   */
  readExpr?: Record<string, string>;
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

export interface StandingDerivation {
  id: string;
  target: string;
  expression: string;
  dependencies: string[];
}

export interface RuntimeHandler {
  id: string;
  on: Record<string, Action[]>;
}

export interface ProgramDefinition {
  vocabulary?: string;
  graph?: ProgramGraph;
  handlers?: RuntimeHandler[];
  machines?: Machine[];
  derivations?: StandingDerivation[];
}

export interface ProjectedProgramDefinition extends ProgramDefinition {
  root: DocNode;
}

export interface HeadlessProgramDefinition extends ProgramDefinition {
  root?: never;
}

export type ExecutableProgramDefinition = ProjectedProgramDefinition | HeadlessProgramDefinition;

export interface CapabilityDescriptor {
  propsSchema?: object;
  emits?: string[];
  slots?: string[];
  // Which prop receives bound data from a read edge (e.g. metric -> "value", table -> "rows").
  // The presentation compiler consults this so binding is generic per capability; defaults to "value".
  dataProp?: string;
}

// An external effect requested by the reducer (invoke/route/request). The kernel
// hands these to the Orchestrator provider AFTER the pure reduction settles; the
// reducer itself never performs them, preserving the pure-reducer law.
interface ExternalEffectBase {
  effectId?: string;
  node: string;
  actorId?: string;
  data: Record<string, Json>;
}

export type OrchestratorEffect =
  | (ExternalEffectBase & { kind: "invoke"; control: InvokeControl })
  | (ExternalEffectBase & { kind: "route"; control: RouteControl })
  | (ExternalEffectBase & { kind: "request"; control: RequestControl });

export interface EffectSettlement {
  effectId: string;
  outcome: "resolved" | "rejected" | "cancelled" | "failed";
  data?: Json;
  detail?: Record<string, Json>;
}

// What the Orchestrator returns: direct store deltas and/or follow-up events
// (e.g. a resolved async result driving a machine transition).
export interface OrchestratorResult {
  ops?: PatchOp[];
  events?: GIKEvent[];
  /** Raw operation-contract response consumed by a queued Cell source output transform. */
  sourceOutput?: Json;
  /** Runtime-originated structural proposal; Kernel applies it only through its admission hook. */
  program?: ProgramPatch;
  /** Local output-port values returned when settling a graph invoke node. */
  outputs?: Record<string, Json>;
  /** Semantic settlement recorded by observability (for example rejected or confirmation-required). */
  outcome?: string;
  /** Structured, serializable context for the settlement receipt. */
  detail?: Record<string, Json>;
  /** Correlated external response, validated against the effect response schema before admission. */
  settlement?: EffectSettlement;
}

export type InvocationId = string;

export interface OrchestratorProgress {
  name: string;
  detail?: Record<string, Json>;
}

export interface InvocationProgress {
  invocationId: InvocationId;
  seq: number;
  node: string;
  effect: "invoke";
  tool?: string;
  actorId?: string;
  name: string;
  detail?: Record<string, Json>;
}

export interface InvocationControl {
  readonly id: InvocationId;
  readonly signal: AbortSignal;
  emitProgress(progress: OrchestratorProgress): Promise<void>;
  emit(result?: OrchestratorResult): Promise<void>;
}

export type SourceCompletionStatus = "success" | "failure";

export interface SourceRunState {
  id: string;
  lastRequestedToken: string | null;
  lastCompletedToken: string | null;
  lastCompletionStatus: SourceCompletionStatus | null;
  queueRequestedToken: string | null;
}

export interface CellRunState {
  sources: SourceRunState[];
  sourceValues?: Record<string, Json>;
}

export interface ProjectedSourceRunState extends SourceRunState {
  status: "idle" | "running";
  hasPendingRequest: boolean;
  lastRequestFailed: boolean;
}

export interface ProjectedCellRunState {
  sources: ProjectedSourceRunState[];
  numSourcesRunning: number;
}

export interface BlueprintRunState {
  cells: Record<string, CellRunState>;
}

export class InvocationClosedError extends Error {
  constructor(id: InvocationId) {
    super(`GenUI kernel: invocation ${id} is closed`);
    this.name = "InvocationClosedError";
  }
}

/**
 * A projection-view import: binds a local alias to a projection-view provider, so a document can reference a
 * capability as `alias:name`. Nothing is ambient; every package or `self` provider is imported. `use`
 * optionally restricts (and documents) the borrowed subset; omitted means the whole provider.
 */
export interface ProjectionViewImport {
  from: string; // provider name: package id, "self", or another bundle's name
  use?: string[]; // optional whitelist of capability names borrowed under this alias
}

/** Reuse scope for a Blueprint-owned service declaration. The declaration may identify a concrete
 * provider kind and carry non-secret configuration such as endpoints and credential references;
 * literal secrets, execution authority, queues, and executor bindings remain host-owned. */
export type ServiceScope = "per-invocation" | "per-cell" | "per-blueprint" | "per-session";

/** Severity of a single guardrail rule: `"error"` blocks settlement and triggers `onViolation`;
 * `"warning"` is recorded on the settled result but never blocks. */
export type GuardrailLevel = "error" | "warning";

/** A single declarative guardrail rule authored as data. Mirrors the `@gik-ai/evaluators` declarative
 * validator shape (the same engine already used for authored-input validation) so a Blueprint
 * author uses one vocabulary for both. `jsonata` evaluates a boolean expression, `ajv-schema`
 * checks shape against a JSON Schema, `typedef` checks the basic JS type, the Blueprint kinds apply
 * the evaluator-owned structural and semantic validators, and `blueprint-capability-acceptance`
 * checks a value's declared/used capabilities against an accepted-capabilities list read from the
 * request. */
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
    }
  | {
      kind: "blueprint" | "blueprint-cell" | "blueprint-tier" | "blueprint-service-recipe" | "blueprint-projection-recipe";
      message?: string;
      level?: GuardrailLevel;
      code?: string;
      node?: string;
    }
  | {
      kind: "blueprint-capability-acceptance";
      /** Key read from the `request` binding holding the accepted capability list. Defaults to
       * `"acceptedCapabilities"`. */
      acceptedField?: string;
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

export interface ServiceTransform {
  kind: "jsonata";
  expr: string;
}

export interface ServiceDataStage {
  transform?: ServiceTransform;
  /** Selects the value checked by `validators` after `transform`; defaults to the transformed value. */
  validatorInput?: ServiceTransform;
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
  failureSettlement?: ServiceSettlementStage;
  onViolation?: GuardrailViolationAction;
}

export interface BlueprintServiceReference {
  $ref: string;
}

interface ServiceDeclarationBase {
  /** Contract version or compatible version range understood by the host's service resolver. */
  version: string;
  /** Blueprint invoke name -> complete declarative service operation. */
  operations: Record<string, ServiceOperationDeclaration>;
  /** Provider-native adapter/session reuse policy. */
  scope?: ServiceScope;
}

export interface NativeServiceDeclaration extends ServiceDeclarationBase {
  /** Host-registered executable kind, for example `copilot-agent` or `foundry-agent`. */
  kind: string;
  blueprint?: never;
  /** Blueprint-owned, kind-specific configuration validated by the registered service kind.
   * Endpoints and opaque credential references are permitted; literal credentials are forbidden. */
  config?: Json;
}

export interface BlueprintServiceDeclaration extends ServiceDeclarationBase {
  /** Host-resolved Blueprint implementation, using the same keyed reference as nested Blueprints. */
  blueprint: BlueprintServiceReference;
  kind?: never;
  config?: never;
}

export type ServiceDeclaration = NativeServiceDeclaration | BlueprintServiceDeclaration;

export type ServiceUse = {
  /** The named operation to invoke, matching a key in the referenced service's `operations` map.
   * The operation's `contract` is always resolved from that declaration, never restated here. */
  operation: string;
  service: string;
};

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
  /** Blueprint-owned service declarations resolved to trusted provider adapters by the outer host. */
  services?: Record<string, ServiceDeclaration>;
}

export interface ProjectedVocabularyManifest {
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

export type HeadlessVocabularyManifest = Omit<ProjectedVocabularyManifest, "capabilities"> & {
  capabilities?: never;
};

export type ExecutableVocabularyManifest = ProjectedVocabularyManifest | HeadlessVocabularyManifest;

export interface TraceEvent {
  event: "resolve" | "fallback" | "action" | "transition" | "validate" | "effect";
  node?: string;
  detail?: Record<string, unknown>;
  ts?: number;
}

export type TraceSink = (t: TraceEvent) => void;

export const GIK_VERSION = "0.1";

export interface VocabularyMessage {
  gik: typeof GIK_VERSION;
  type: "vocabulary";
  payload: ProjectedVocabularyManifest;
}

export interface ProjectedProgramMessage {
  gik: typeof GIK_VERSION;
  type: "program";
  payload: ProjectedProgramDefinition;
}

export interface ProgramMessage {
  gik: typeof GIK_VERSION;
  type: "program";
  payload: HeadlessProgramDefinition;
}

export type ExecutableProgramMessage = ProjectedProgramMessage | ProgramMessage;

export interface PatchMessage {
  gik: typeof GIK_VERSION;
  type: "patch";
  payload: Patch;
}

export interface ProgressMessage {
  gik: typeof GIK_VERSION;
  type: "progress";
  payload: InvocationProgress;
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
  | VocabularyMessage
  | ProjectedProgramMessage
  | ProgramMessage
  | PatchMessage
  | ProgressMessage
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
