// Layered DSL lowering (ADR-0016).
//
// The executable program grammar is the single bottom layer. Higher-level layers
// (Task / Domain / Interaction / Service) are NOT new kernels and NOT new grammars: they are
// pure transforms — "stages" — that compile a higher-level DSL down toward a kernel program.
//
//   Higher-level artifact  ->  ...  ->  executable program  ->  Kernel
//   \____________ each arrow is a Stage: a pure function ____________/
//
// A pipeline composes stages; its terminal output is a projected or headless executable program,
// which then flows through the same validate-before-commit gate as a hand-authored program.
// Nothing below this line knows about layers — the kernel only ever sees an executable program.

import { envelope } from "./types";
import type {
  ExecutableProgramDefinition,
  ExecutableProgramMessage,
  ProgramMessage,
  ProjectedProgramDefinition,
  ProjectedProgramMessage,
} from "./types";
import { validateProgramMessage } from "./validate";

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
 * accepts. Not every pipeline needs all four layers — a simple lowering may go straight
 * from a Domain DSL to the kernel program.
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

/** A lowering is any stage whose terminal output is an executable program definition. */
export type ProgramLowering<
  In,
  Out extends ExecutableProgramDefinition = ExecutableProgramDefinition,
> = Stage<In, Out>;

export type ProgramMessageFor<Out extends ExecutableProgramDefinition> =
  Out extends ProjectedProgramDefinition ? ProjectedProgramMessage : ProgramMessage;

/**
 * Run any executable-program lowering through the shared validate-before-commit gate.
 * The returned wire message preserves whether the lowering emitted a projected or headless program.
 */
export function lowerToProgram<In, Out extends ExecutableProgramDefinition>(
  lowering: ProgramLowering<In, Out>,
  input: In,
): ProgramMessageFor<Out> {
  const message = envelope("program", lowering(input)) as ExecutableProgramMessage;
  validateProgramMessage(message);
  return message as ProgramMessageFor<Out>;
}

/**
 * Run a projected lowering through the shared validate-before-commit gate. Throws
 * `ValidationError` if a stage produced a malformed program. Use {@link lowerToProgram}
 * when the terminal program may be headless.
 */
export function lowerToProjectedProgram<In>(
  lowering: ProgramLowering<In, ProjectedProgramDefinition>,
  input: In,
): ProjectedProgramMessage {
  return lowerToProgram(lowering, input);
}
