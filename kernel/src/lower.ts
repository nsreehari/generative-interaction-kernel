// Layered DSL lowering (ADR-0016).
//
// The kernel grammar is the single bottom layer — the "UI DSL". Higher-level layers
// (Task / Domain / Interaction) are NOT new kernels and NOT new grammars: they are pure
// transforms — "stages" — that compile a higher-level DSL down toward a kernel document.
//
//   Task DSL  ->  Domain DSL  ->  Interaction DSL  ->  UI DSL (kernel document)  ->  Renderer
//   \______________ each arrow is a Stage: a pure function ______________/
//
// A pipeline composes stages; its terminal output is a kernel `DocumentPayload`, which
// then flows through the exact same validate-before-commit gate as a hand-authored
// document (see authoring.ts). Nothing below this line knows about layers — the kernel
// only ever sees a document.

import { envelope } from "./types";
import type { DocumentMessage, DocumentPayload } from "./types";
import { validateDocumentMessage } from "./validate";

/** A lowering stage: a pure transform from one DSL layer to the next one below it. */
export type Stage<In, Out> = (input: In) => Out;

/** A fluent, type-safe composition of stages, built one layer at a time. */
export interface Pipeline<In, Out> {
  /** Append the next stage below the current one. */
  to<Next>(stage: Stage<Out, Next>): Pipeline<In, Next>;
  /** Collapse the whole pipeline into a single stage. */
  build(): Stage<In, Out>;
}

/**
 * Start a pipeline from the top stage. Add lower stages with `.to(...)`; each `.to`
 * keeps the types aligned, so a stage can only be attached to one whose output it
 * accepts. Not every pipeline needs all four layers — a simple profile may go straight
 * from a Domain DSL to the kernel document.
 */
export function pipeline<In, Out>(first: Stage<In, Out>): Pipeline<In, Out> {
  const run = first;
  return {
    to<Next>(stage: Stage<Out, Next>): Pipeline<In, Next> {
      return pipeline<In, Next>((input: In) => stage(run(input)));
    },
    build() {
      return run;
    },
  };
}

/** A lowering is any stage whose terminal output is a kernel document payload. */
export type Lowering<In> = Stage<In, DocumentPayload>;

/**
 * Run a lowering and validate-before-commit: envelope the produced document and run the
 * same structural schema validation as {@link authorDocument}. Throws `ValidationError`
 * if a stage produced a malformed document; returns the wire `DocumentMessage` otherwise.
 * This is the one gate every layer must pass through, so a bug in a higher-layer compiler
 * is caught at the kernel boundary rather than at render time.
 */
export function lowerToDocument<In>(lowering: Lowering<In>, input: In): DocumentMessage {
  const message = envelope("document", lowering(input)) as DocumentMessage;
  validateDocumentMessage(message);
  return message;
}
