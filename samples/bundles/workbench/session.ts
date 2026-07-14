// The shared "session artifact" — the spine of the workbench. All three purposes (inspect,
// no-code build, agent authoring) are just different *writers* of {spec, ctx, profile}; the
// playground is the single *reader*. This module runs the pure pipeline once per change:
//
//   spec + ctx + interaction->presentation recipe  -->  Presentation DSL
//   presentation + presentation->runtime recipe    -->  UI DSL document
//   document  -->  Kernel  -->  GenUIController  -->  (React renders it live)
//
// Slice 1 keeps the guest *in-process* (GenUIController); the transport-backed GIKClient seam
// is introduced in the agent slice, where out-of-process authoring actually needs it.

import {
  Kernel,
  bufferSink,
  lowerToDocument,
  unwrap,
  type DocumentPayload,
  type TraceEvent,
} from "@gik/kernel";
import {
  lowerPresentation,
  planPresentationWithRecipe,
  planningRecipeOf,
  runtimeRecipeOf,
  type InteractionSpec,
  type InteractionTaxonomy,
  type LayerRecipe,
  type PresentationContext,
  type PresentationEdits,
  type PresentationSpec,
  type ResolvedProfile,
} from "@gik/profile";
import { GenUIController } from "@gik/react";
import { applyPresentationEdits, emptyEdits } from "./projection_views/libs/edits";
import type { ProfileIdentity } from "./projection_views/libs/authoring";
import { DEMO_MANIFEST, demoDataFor, seedState } from "./bundles/demo/demo";

export interface Session {
  /** the interaction being presented (with demo data filled in). */
  spec: InteractionSpec;
  /** the presentation context (surface / device / space / attention / expertise). */
  ctx: PresentationContext;
  /** Layer 4 — the planned Presentation DSL (regions + priority/disclosure/rationale). */
  presentation: PresentationSpec;
  /** the lowered UI DSL document the kernel interprets. */
  document: DocumentPayload;
  /** the in-process runtime rendering the guest. */
  controller: GenUIController;
  /** live trace buffer (mutated as the guest dispatches events). */
  traces: TraceEvent[];
  /** identity of the profile this session was built with, for portable authored-session replay. */
  profile: ProfileIdentity;
}

/** Run the whole upper pipeline for one {spec, ctx, profile} and stand up a fresh guest runtime. */
export function buildSession(
  base: InteractionSpec,
  ctx: PresentationContext,
  profile: ResolvedProfile<LayerRecipe>,
  edits: PresentationEdits = emptyEdits
): Session {
  const taxonomy = profile.resources.taxonomy as unknown as InteractionTaxonomy;
  // fill demo data by facet role unless the spec already carries an explicit data map.
  const spec: InteractionSpec = { ...base, data: base.data ?? demoDataFor(base, taxonomy) };
  const planning = profile.stages.map((stage) => planningRecipeOf(stage.recipe)).find(Boolean);
  const lowering = [...profile.stages].reverse().map((stage) => runtimeRecipeOf(stage.recipe)).find(Boolean);
  if (!planning || !lowering) {
    throw new Error(`Profile '${profile.artifact.payload.id}' must expose planning and runtime lowering recipe data`);
  }
  const presentation = applyPresentationEdits(
    planPresentationWithRecipe(spec, ctx, planning, taxonomy),
    edits,
    taxonomy
  );
  const message = lowerToDocument(lowerPresentation(lowering), presentation);
  const document = unwrap(message);

  const state = seedState(unwrap(DEMO_MANIFEST).namespaces ?? []);
  const buffer = bufferSink();
  const kernel = new Kernel(DEMO_MANIFEST, message, { state, sink: buffer.sink });
  const controller = new GenUIController(kernel);

  return {
    spec,
    ctx,
    presentation,
    document,
    controller,
    traces: buffer.events,
    profile: { id: profile.artifact.payload.id, version: profile.artifact.payload.version },
  };
}
