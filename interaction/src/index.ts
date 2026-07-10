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
export * from "./edits";
export * from "./authoring";
export * from "./lowering";
export * from "./schema";

import type { PresentationBinding } from "./lowering";

/**
 * The live-cards profile's presentation binding: maps facet ROLES to live-cards kernel
 * capabilities (bind once per role, not per facet). Roles with no mapping (`graph`, `form`)
 * fall back to the region name as the capability and render as graceful fallback nodes —
 * the forward-compatible path for facets a profile hasn't implemented yet.
 */
export const liveCardsBinding: PresentationBinding = {
  container: "ui:board",
  roleCapability: {
    summary: "ui:metric",
    metrics: "ui:metric",
    status: "ui:metric",
    narrative: "ui:markdown",
    recommendation: "ui:markdown",
    collection: "ui:table",
    detail: "ui:table",
    timeline: "ui:table",
    comparison: "ui:table",
    actions: "ui:actions",
    graph: "ui:chart",
    // `form` intentionally unmapped -> graceful fallback.
  },
  regionCapability: {
    context: "ui:markdown",
    explanation: "ui:markdown",
    content: "ui:markdown",
    relationships: "ui:chart",
    tasks: "ui:todo",
  },
  regionSelectEvent: {
    detail: "rowSelect",
    left: "rowSelect",
    right: "rowSelect",
    results: "rowSelect",
    options: "rowSelect",
    alerts: "rowSelect",
    tasks: "rowSelect",
    thread: "rowSelect",
  },
};
