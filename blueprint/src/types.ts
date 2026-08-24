import type {
  Action,
  ExecutableProgramDefinition,
  ExternalsSpec,
  GuardrailRule,
  Json,
  ProgramPatch,
  ProgramPatchOperation,
  ServiceDeclaration,
  ServiceTransform,
  ServiceUse,
} from "@gik/kernel";
import type { DeclarativeFormSpec, SystemInputToken } from "@gik/evaluators";

export interface TierDefinition {
  id: string;
  /** Reusable classification for authoring, policy, and tooling; `id` remains the chain identity. */
  kind: string;
  description?: string;
}

export interface ProjectionTierDefinition extends TierDefinition {
  /** Blueprint-local projection capabilities available at this stage. These are compiler symbols,
   * not an ordering over the host's flat semantic/primitive/Fluent capability catalog. */
  capabilities: readonly string[];
}

/** The shared identity every tier transition carries on either axis. It is never authored on its own:
 * a Blueprint declares only the two concrete axis dialects below. */
export interface LoweringRecipeDefinition {
  id: string;
  from: string;
  to: string;
}

export interface BlueprintRepresentation {
  id: string;
  when?: string;
  extends?: string;
  /** Upserts one named potential view on an existing Cell, addressed by (cellId, viewName). Every
   * other named view already declared on that Cell is left untouched. */
  views?: Record<string, Record<string, CellPotentialView>>;
  /** Removes named views before this representation's upserts are applied. */
  removeViews?: Record<string, readonly string[]>;
  decorators?: BlueprintRepresentationDecorator[];
  /** Replaces presentation layout while preserving the Blueprint's authored capability authority. */
  presentation?: RepresentationPresentationDefinition;
  /** Appends additional slot entries to the authored presentation — a plain array concat, since
   * slots are a flat list rather than a nested tree. */
  presentationAppend?: readonly PresentationSlot[];
}

export interface BlueprintRepresentationDecorator {
  select: string;
  before?: CellViewDecoration;
  after?: CellViewDecoration;
}

export interface CellImplementationOverride {
  sources?: readonly CellSource[];
  compute?: readonly CellComputation[];
  behavior?: CellBehavior;
}

export interface BlueprintImplementationProgram {
  id: string;
  when?: string;
  cells?: Record<string, CellImplementationOverride>;
  services?: Record<string, ServiceDeclaration>;
}

/** A deterministic projection-axis tier transition. It owns exactly one seam: which named
 * `potentialViews` (and which presentation skeleton) a Cell manifests under immutable context. It
 * never touches `sources`, `compute`, `behavior`, or `services`. */
export interface ProjectionLoweringRecipeDefinition extends LoweringRecipeDefinition {
  representations: BlueprintRepresentation[];
  fallback: string;
}

/** A deterministic service-axis tier transition. It owns the broader contract-compatible Cell
 * *implementation* seam — `sources`, `compute`, `behavior`, and top-level `services` declarations —
 * not only transport/service declarations. The axis is named `service` because the choice it makes
 * is "which concrete backing service implementation answers this Cell's already-authored contracts",
 * but the selected implementation program may carry the whole contract-compatible implementation of
 * that choice. It never touches `potentialViews` or `presentation`. */
export interface ServiceLoweringRecipeDefinition extends LoweringRecipeDefinition {
  implementationPrograms: BlueprintImplementationProgram[];
  fallback: string;
}

export interface BlueprintRuntimeDefinition {
  externals?: Omit<ExternalsSpec, "services">;
  state?: Record<string, Json>;
}

export interface CellInput {
  token: string;
  as?: string;
  required?: boolean;
  cardinality?: "one" | "many";
  schema?: Record<string, Json>;
}

export interface CellOutput {
  token: string;
  from?: string;
  when?: string;
  schema?: Record<string, Json>;
}

export type CellSource = ServiceUse & {
  id: string;
  when?: string;
  input?: ServiceTransform;
  output?: ServiceTransform;
  /** Extra guardrails checked against this response, at this usage site, on top of the operation's
   * own `response.validators` -- gated by the same operation `onViolation` policy (no separate
   * authority). Runs at host level, right after the operation's own `response.transform`, before
   * its settlement transform. */
  acceptanceCriteria?: readonly GuardrailRule[];
};

export interface CellComputation {
  id: string;
  expression: string;
  assign: string;
  dependencies?: readonly string[];
}

export interface CellEventContract {
  payloadSchema: Record<string, Json>;
  description?: string;
}

export interface CellBehavior {
  on?: Record<string, Action[]>;
}

export type CellViewBinding =
  | { from: string; expression?: never }
  | { from?: never; expression: string };

export interface CellViewDecoration {
  capability: string;
  props?: Record<string, Json>;
  bindings?: Record<string, CellViewBinding>;
  visibility?: string;
}

/** A named potential manifestation carried by a Cell. It is not a data-flow participant and is
 * dormant — never materialized — unless its own `region` resolves into a slot that is part of the
 * presentation active for the current materialization. */
export interface CellPotentialView extends Omit<CellViewDecoration, "capability"> {
  capability?: string;
  before?: readonly CellViewDecoration[];
  after?: readonly CellViewDecoration[];
  /** Layers this view's primary capability nests inside, outermost first (the primary is always
   * innermost) — e.g. `[{capability:"fluent:dialog",...}]` makes the primary render as that
   * dialog's own body, a genuine child in its rendered component tree, not a flat sibling the way
   * `before`/`after` are. Unlike `before`/`after`, a `wrap` layer's own `visibility` gates its
   * whole subtree: hiding a wrap layer hides everything it wraps, including the primary. */
  wrap?: readonly CellViewDecoration[];
  /** Which presentation slot(s) this view attaches to. An array renders one independent instance
   * per slot, all reading/writing through this same Cell. */
  region?: string | readonly string[];
}

export type CellBlueprint =
  | { $ref: string | CellViewBinding; inline?: never }
  | { inline: BlueprintArtifact; $ref?: never };

export interface CellDefinition {
  id: string;
  metadata?: Record<string, Json>;
  inputs?: readonly CellInput[];
  systemInputs?: readonly SystemInputToken[];
  sources?: readonly CellSource[];
  compute?: readonly CellComputation[];
  outputs?: readonly CellOutput[];
  events?: Record<string, CellEventContract>;
  behavior?: CellBehavior;
  /** Zero, one, or many named external manifestations this Cell carries. A Cell has no knowledge
   * of whether any of them ever materializes. */
  potentialViews?: Record<string, CellPotentialView>;
  blueprint?: CellBlueprint;
}

/** A presentation slot entry. A bare string is a slot with no declared parent (typically the root).
 * An object self-declares which slot it nests inside via `region` — the same mechanism a Cell's view
 * uses to attach to a slot. */
export interface PresentationSlotEntry {
  id: string;
  region?: string;
}

export type PresentationSlot = string | PresentationSlotEntry;

export type AllowedCapabilityEntry = string | { tier: string };

export type PresentationLayoutDirection = "row" | "row-reverse" | "column" | "column-reverse";
export type PresentationLayoutGap = "none" | "xs" | "s" | "m" | "l" | "xl";
export type PresentationLayoutAlign = "stretch" | "start" | "center" | "end" | "baseline";
export type PresentationLayoutJustify = "start" | "center" | "end" | "space-between" | "space-around" | "space-evenly";

/** How one named slot arranges its own attached children -- a pure rendering/arrangement concern,
 * orthogonal to `region` (which declares *whether* something attaches, not how the result looks).
 * Absent (the default) renders exactly as before this field existed: a bare Fragment, no DOM
 * wrapper, no arrangement -- children simply stack as whatever block layout their host page already
 * has. */
export interface PresentationSlotLayout {
  direction?: PresentationLayoutDirection;
  gap?: PresentationLayoutGap;
  align?: PresentationLayoutAlign;
  justify?: PresentationLayoutJustify;
  wrap?: boolean;
}

/** The whole presentation is a closed, flat set of named slots plus a root. It has no knowledge of
 * Cells and no tree of who contains whom — every attachment (slot-in-slot, or Cell-into-slot via
 * `CellView.region`) is self-declared on the thing attaching. */
export interface PresentationDefinition {
  slots: readonly PresentationSlot[];
  root: string;
  /** The mandatory closed projection vocabulary. Exact strings authorize terminal host
   * capabilities; `{ tier }` admits every named capability declared by that projection tier. */
  allowedCapabilities: readonly AllowedCapabilityEntry[];
  /** Optional layout for named slots' own children, keyed by slot id. A slot absent from this map
   * keeps rendering as a plain Fragment, exactly as before this field existed. Layout is a rendering
   * concern about one slot's own children, kept as one flat, easy-to-scan map here rather than
   * spread across individual slot entries (which stay minimal either way) or duplicated per Cell
   * view -- symmetric with `allowedCapabilities` already being a flat, presentation-wide field. */
  layout?: Record<string, PresentationSlotLayout>;
}

export type RepresentationPresentationDefinition = Omit<PresentationDefinition, "allowedCapabilities">;


export type BlueprintStructureMode = "fixed" | "reconfigurable" | "adaptive";

export type BlueprintStructureOperation =
  | "addCell"
  | "replaceCell"
  | "removeCell"
  | "setPresentation";

export interface BlueprintStructurePolicy {
  /** Semantic Blueprint operations admitted in adaptive mode. */
  allowedBlueprintOperations?: readonly BlueprintStructureOperation[];
  /** Executable program operations that adaptive runtime behavior may originate. */
  allowedProgramOperations?: readonly ProgramPatchOperation["op"][];
}

export interface BlueprintInterfacePort {
  schema?: Record<string, Json>;
  required?: boolean;
  description?: string;
  /** State path projected by a Blueprint output port. */
  from?: string;
}

export interface BlueprintInterfaceDefinition {
  inputs?: Record<string, BlueprintInterfacePort>;
  outputs?: Record<string, BlueprintInterfacePort>;
  events?: readonly string[];
}

export type BlueprintPatchOperation =
  | { op: "addCell"; cell: CellDefinition }
  | { op: "replaceCell"; cellId: string; cell: CellDefinition }
  | { op: "removeCell"; cellId: string }
  | { op: "setPresentation"; presentation: PresentationDefinition };

export type BlueprintPatch = readonly BlueprintPatchOperation[];
export type BlueprintPatchOrigin = "authorized" | "runtime";

export interface BlueprintPatchRequest {
  origin: BlueprintPatchOrigin;
  patch: BlueprintPatch;
}

export type BlueprintPatchDecision =
  | { accepted: true; patch: BlueprintPatch }
  | { accepted: false; reason: "fixed-structure" | "authorization-required" | "policy-rejected" };

export interface BlueprintDefinition {
  id: string;
  kind: string;
  version: string;
  structureMode?: BlueprintStructureMode;
  structurePolicy?: BlueprintStructurePolicy;
  interface?: BlueprintInterfaceDefinition;
  /** The service (implementation) axis' authored tiers. Independent of the projection axis. */
  serviceTiers: TierDefinition[];
  /** The service axis' tier transitions. Empty means the axis has exactly one terminal tier. */
  serviceRecipes: ServiceLoweringRecipeDefinition[];
  /** The projection (presentation) axis' authored tiers. Independent of the service axis. */
  projectionTiers: ProjectionTierDefinition[];
  /** The projection axis' tier transitions. Empty means the axis has exactly one terminal tier. */
  projectionRecipes: ProjectionLoweringRecipeDefinition[];
  contextFormSpec?: DeclarativeFormSpec;
  cells?: Record<string, CellDefinition>;
  presentation?: PresentationDefinition;
  services?: Record<string, ServiceDeclaration>;
  runtime: BlueprintRuntimeDefinition;
  metadata?: Record<string, Json>;
}

export interface BlueprintArtifact {
  gik: "0.1";
  type: "blueprint";
  payload: BlueprintDefinition;
}

export type BlueprintReferenceResolver = (
  ref: string,
  context: { parentBlueprintId: string; cellId: string },
) => BlueprintArtifact;

export interface BlueprintReference {
  scheme: "blueprint";
  id: string;
  version?: string;
}

export interface HostedBlueprintDefinition<TNative = unknown> {
  reference: BlueprintReference;
  blueprint: BlueprintArtifact;
  native?: TNative;
}

export interface HostedBlueprintResolutionContext {
  parentBlueprintId: string;
  parentInstanceId: string;
  cellId: string;
}

export interface BlueprintHostRegistry<TNative = unknown> {
  resolveArtifact(
    reference: BlueprintReference,
    context: HostedBlueprintResolutionContext,
  ): BlueprintArtifact;
  resolve(
    reference: BlueprintReference,
    context: HostedBlueprintResolutionContext,
  ): HostedBlueprintDefinition<TNative> | Promise<HostedBlueprintDefinition<TNative>>;
}

export type BlueprintLowering<Out extends ExecutableProgramDefinition = ExecutableProgramDefinition> =
  (blueprint: BlueprintArtifact) => Out;