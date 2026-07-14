// @gik/profile — the generic profile machinery (the kind *mechanism*). A profile is a typed
// pipeline of kinded layers connected by recipes; each stage's transform is selected by the
// `${fromKind}->${toKind}` pair and executed through an open executor registry (`traceStages`).
export * from "./profile-core";
export * from "./schema";
export * from "./bundle";
