// @gik/profile-genui — the GenUI profile *flavor*: the concrete layer-kind vocabulary
// (interaction / presentation / runtime-document), the `genui-profile` kind, the two lowering
// recipe shapes and their schema/lint, the stage executors, and the full pipeline runner. It
// builds on the generic kind *mechanism* in @gik/profile.

export * from "./interaction";
export * from "./presentation";
export * from "./lowering";
export * from "./schema";
export * from "./profile";
export * from "./authoring";
export {
  PROFILE_BUNDLE_FORMAT,
  createProfileBundle,
  loadProfileBundle,
  parseProfileBundleJson,
  stringifyProfileBundle,
  validateProfileBundle,
  type ProfileArtifactBundle,
} from "./bundle";
