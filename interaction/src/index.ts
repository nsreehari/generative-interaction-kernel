// The Interaction layer package (ADR-0017, ADR-0018): the platform-owned upper half of the
// stack, above the kernel's UI DSL.
//
//   Intent (agents)  ->  Domain (app teams)  ->  Interaction Model (L3)  ->
//     Presentation Model (L4)  ->  UI DSL / kernel doc  ->  Renderer
//
// The platform owns L3–L5. This package owns L3 (interaction taxonomy) and L4 (presentation
// model + the presentation compiler between them), then lowers to the kernel's UI document.
// The moat is here: the interaction taxonomy + the presentation compiler.

export * from "./interaction";
export * from "./presentation";
export * from "./lowering";
export * from "./schema";
export * from "./profile";
export * from "./authoring";
