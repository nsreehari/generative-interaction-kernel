// @gik/profile — the generic profile machinery (the kind *mechanism*). A profile is a typed
// pipeline of kinded layers connected by recipes; each stage's transform is selected by the
// `${fromKind}->${toKind}` pair and executed through an open executor registry (`traceStages`).
// The concrete GenUI kind *values* (interaction / presentation / runtime-document), their recipe
// shapes, and their executors live in @gik/profile-genui.
export {
  resolveProfile,
  recipeForKinds,
  lintProfileArtifacts,
  traceStages,
  type LayerDefinition,
  type LoweringRecipeRef,
  type Profile,
  type ProfileArtifact,
  type RecipeBase,
  type RecipeArtifactBase,
  type ResolvedProfile,
  type ResolvedProfileStage,
  type RecipeLintWarning,
  type StageExecutor,
  type StageTrace,
} from "../../../interaction/src/profile-core";