// The shared "session artifact" — the spine of the workbench. All three purposes (inspect,
// no-code build, agent authoring) are just different *writers* of {spec, ctx, binding}; the
// playground is the single *reader*. This module runs the pure pipeline once per change:
//
//   spec + ctx  --defaultPresentationPlanner-->  Presentation DSL
//   spec + ctx + binding  --compileInteraction/lowerToDocument-->  UI DSL document
//   document  -->  Kernel  -->  GenUIController  -->  (React renders it live)
//
// Slice 1 keeps the guest *in-process* (GenUIController); the transport-backed GenUIClient seam
// is introduced in the agent slice, where out-of-process authoring actually needs it.

import {
  Kernel,
  bufferSink,
  lowerToDocument,
  unwrap,
  type DocumentPayload,
  type TraceEvent,
} from "../../../kernel/src/index";
import { GenUIController } from "../../../adapters/react/src/index";
import {
  compileInteraction,
  defaultPresentationPlanner,
  type InteractionSpec,
  type PresentationBinding,
  type PresentationContext,
  type PresentationSpec,
} from "../../../interaction/src/index";
import { DEMO_MANIFEST, demoDataFor, seedState } from "./demo";

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
}

/** Run the whole upper pipeline for one {spec, ctx, binding} and stand up a fresh guest runtime. */
export function buildSession(
  base: InteractionSpec,
  ctx: PresentationContext,
  binding: PresentationBinding
): Session {
  // fill demo data by facet role unless the spec already carries an explicit data map.
  const spec: InteractionSpec = { ...base, data: base.data ?? demoDataFor(base) };

  const presentation = defaultPresentationPlanner(spec, ctx);
  // compile through the platform's validate-before-commit boundary (returns a document message).
  // pass the manifest capabilities so each region's data binds onto the prop that capability reads.
  const capabilities = unwrap(DEMO_MANIFEST).capabilities;
  const message = lowerToDocument(
    (s: InteractionSpec) => compileInteraction(s, ctx, binding, defaultPresentationPlanner, capabilities),
    spec
  );
  const document = unwrap(message);

  const state = seedState(unwrap(DEMO_MANIFEST).namespaces ?? []);
  const buffer = bufferSink();
  const kernel = new Kernel(DEMO_MANIFEST, message, { state, sink: buffer.sink });
  const controller = new GenUIController(kernel);

  return { spec, ctx, presentation, document, controller, traces: buffer.events };
}
