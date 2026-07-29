import type {
  Action,
  ExecutableProgramDefinition,
  ExternalsSpec,
  Json,
  ProjectedVocabularyManifest,
  ProgramPatch,
  ProgramPatchOperation,
  Reaction,
  ServiceDeclaration,
  ServiceRequirement,
  ServiceUse,
} from "@gik/kernel";

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
  views?: Record<string, CellView>;
  presentation?: PresentationProjection;
  presentationAppend?: PresentationProjection["placements"];
}

/** A deterministic tier transition that preserves Cells and lowers only their representation. */
export interface RepresentationLoweringRecipeDefinition extends LoweringRecipeDefinition {
  representations: BlueprintRepresentation[];
  fallback: string;
}

export type BlueprintResource = { inline: Json } | { $ref: string };

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

export type CellSource = ServiceUse & { id: string; when?: string };

export interface CellComputation {
  id: string;
  expression: string;
  assign: string;
  dependencies: readonly string[];
  when?: string;
}

export interface CellBehavior {
  events?: Record<string, Action[]>;
  reactions?: Reaction[];
}

export type CellViewBinding =
  | { from: string; expression?: never }
  | { from?: never; expression: string };

export interface CellView {
  capability: string;
  props?: Record<string, Json>;
  bindings?: Record<string, CellViewBinding>;
  visibility?: string;
}

export type CellBlueprint =
  | { $ref: string; inline?: never }
  | { inline: BlueprintArtifact; $ref?: never };

export interface CellDefinition {
  id: string;
  kind?: string;
  metadata?: Record<string, Json>;
  state?: {
    initial?: Record<string, Json>;
    schema?: Record<string, Json>;
    persistence?: "ephemeral" | "checkpointed" | "durable";
  };
  inputs?: readonly CellInput[];
  sources?: readonly CellSource[];
  compute?: readonly CellComputation[];
  outputs?: readonly CellOutput[];
  behavior?: CellBehavior;
  view?: CellView;
  blueprint?: CellBlueprint;
}

export interface RelationshipDefinition {
  kind: string;
  participants: readonly string[];
  configuration?: Json;
  metadata?: Record<string, Json>;
}

export interface ProjectionDefinition {
  kind: string;
  participants?: readonly string[];
  configuration?: Json;
  metadata?: Record<string, Json>;
}

export interface PresentationProjection {
  roots: readonly string[];
  placements?: readonly {
    cell: string;
    parent?: string;
    slot?: string;
    order?: number;
  }[];
}

export type BlueprintStructureMode = "fixed" | "reconfigurable" | "adaptive";

export type BlueprintStructureOperation =
  | "addCell"
  | "replaceCell"
  | "removeCell"
  | "setRelationship"
  | "removeRelationship"
  | "setProjection"
  | "removeProjection";

export interface BlueprintStructurePolicy {
  /** Semantic Blueprint operations admitted in adaptive mode. */
  allowedBlueprintOperations?: readonly BlueprintStructureOperation[];
  /** Executable program operations that adaptive runtime behavior may originate. */
  allowedProgramOperations?: readonly ProgramPatchOperation["op"][];
}

export type BlueprintPatchOperation =
  | { op: "addCell"; cell: CellDefinition }
  | { op: "replaceCell"; cellId: string; cell: CellDefinition }
  | { op: "removeCell"; cellId: string }
  | { op: "setRelationship"; relationshipId: string; relationship: RelationshipDefinition }
  | { op: "removeRelationship"; relationshipId: string }
  | { op: "setProjection"; projectionId: string; projection: ProjectionDefinition | PresentationProjection }
  | { op: "removeProjection"; projectionId: string };

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
  tiers: TierDefinition[];
  recipes: TRecipe[];
  context?: Record<string, Json>;
  resources?: Record<string, BlueprintResource>;
  cells?: Record<string, CellDefinition>;
  relationships?: Record<string, RelationshipDefinition>;
  projections?: Record<string, ProjectionDefinition | PresentationProjection> & {
    presentation?: PresentationProjection;
  };
  services?: Record<string, ServiceRequirement | ServiceDeclaration>;
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

export type BlueprintLowering<Out extends ExecutableProgramDefinition = ExecutableProgramDefinition> =
  (blueprint: BlueprintArtifact) => Out;