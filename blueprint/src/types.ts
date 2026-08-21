import type {
  Action,
  ExecutableProgramDefinition,
  ExternalsSpec,
  Json,
  ProjectedVocabularyManifest,
  ProgramPatch,
  ProgramPatchOperation,
  ServiceDeclaration,
  ServiceTransform,
  ServiceUse,
} from "@gik/kernel";
import type { DeclarativeFormSpec, SystemInputToken } from "@gik/evaluators";

export interface TierDefinition {
  id: string;
  kind: string;
  schema?: string;
  description?: string;
  input?: Record<string, Json>;
}

export interface LoweringRecipeDefinition {
  id: string;
  from: string;
  to: string;
}

/** A deterministic tier transition expressed entirely in the shared Blueprint vocabulary. */
export interface VocabularyLoweringRecipeDefinition extends LoweringRecipeDefinition {
  patch: BlueprintPatch;
}

export interface BlueprintRepresentation {
  id: string;
  when?: string;
  extends?: string;
  /** Upserts one named potential view on an existing Cell, addressed by (cellId, viewName). Every
   * other named view already declared on that Cell is left untouched. */
  views?: Record<string, Record<string, CellPotentialView>>;
  decorators?: BlueprintRepresentationDecorator[];
  /** Replaces the whole authored presentation for this representation. */
  presentation?: PresentationDefinition;
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

/** A deterministic tier transition that preserves Cell contracts while lowering representation and inner programs. */
export interface RepresentationLoweringRecipeDefinition extends LoweringRecipeDefinition {
  representations: BlueprintRepresentation[];
  fallback: string;
  implementationPrograms?: BlueprintImplementationProgram[];
  implementationFallback?: string;
}

export interface BlueprintRuntimeDefinition {
  version?: string;
  expression?: string;
  namespaces?: string[];
  contexts?: string[];
  actions?: string[];
  capabilities?: ProjectedVocabularyManifest["capabilities"];
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

/** The whole presentation is a closed, flat set of named slots plus a root. It has no knowledge of
 * Cells and no tree of who contains whom — every attachment (slot-in-slot, or Cell-into-slot via
 * `CellView.region`) is self-declared on the thing attaching. */
export interface PresentationDefinition {
  slots: readonly PresentationSlot[];
  root: string;
}

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

export interface BlueprintDefinition<TRecipe extends LoweringRecipeDefinition = LoweringRecipeDefinition> {
  id: string;
  kind: string;
  version: string;
  structureMode?: BlueprintStructureMode;
  structurePolicy?: BlueprintStructurePolicy;
  interface?: BlueprintInterfaceDefinition;
  tiers: TierDefinition[];
  recipes: TRecipe[];
  contextFormSpec?: DeclarativeFormSpec;
  cells?: Record<string, CellDefinition>;
  presentation?: PresentationDefinition;
  services?: Record<string, ServiceDeclaration>;
  runtime: BlueprintRuntimeDefinition;
  metadata?: Record<string, Json>;
}

export interface BlueprintArtifact<TRecipe extends LoweringRecipeDefinition = LoweringRecipeDefinition> {
  gik: "0.1";
  type: "blueprint";
  payload: BlueprintDefinition<TRecipe>;
}

export type BlueprintReferenceResolver<TRecipe extends LoweringRecipeDefinition = LoweringRecipeDefinition> = (
  ref: string,
  context: { parentBlueprintId: string; cellId: string },
) => BlueprintArtifact<TRecipe>;

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