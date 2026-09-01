// Phase 7: the agent-authoring path. Agents don't hand-write JSON — they compose GIK
// programs from the vocabulary manifest using typed constructors for the *closed*
// grammar, then get two independent safety nets:
//   1. authorProjectedProgram() runs validate-before-commit (structural schema validation) and
//      throws on a malformed program.
//   2. lintVocabularyReferences() returns NON-throwing warnings for references that are
//      structurally valid but semantically suspect (unknown capabilities, events a
//      capability doesn't declare, undeclared namespaces). Unknown capabilities are safe
//      at runtime via graceful fallback, so they are lint, not errors.

import { envelope } from "./types";
import type {
  Action,
  DocNode,
  ProjectedProgramMessage,
  ProjectedProgramDefinition,
  Edges,
  ExecutableProgramDefinition,
  Json,
  Machine,
  ProjectedVocabularyManifest,
  ProgramMessage,
  HeadlessProgramDefinition,
  RuntimeHandler,
  StandingDerivation,
} from "./types";
import { validateProgramMessage } from "./validate";

// --- Action constructors (the five closed families) -------------------------------

/** Write a literal value to a namespace path. */
export function assign(target: string, value: Json): Action {
  return { do: "assign", target, args: { value } };
}

/** Write an expression's result (evaluated against state + `$event`) to a path. */
export function assignFrom(target: string, expr: string): Action {
  return { do: "assign", target, args: { from: expr } };
}

/** Re-emit an event (optionally with a payload) to drive further reduction. */
export function emit(event: string, payload?: Record<string, Json>): Action {
  return payload ? { do: "emit", event, data: payload } : { do: "emit", event };
}

/** Request an out-of-band tool call (an Orchestrator effect, not a store write). */
export function invoke(tool: string, data?: Record<string, Json>): Action {
  return { do: "invoke", control: { tool }, ...(data ? { data } : {}) };
}

/** Request a flow/destination handoff — routing (an Orchestrator effect). */
export function route(to: Json, data?: Record<string, Json>): Action {
  return { do: "route", control: { to }, ...(data ? { data } : {}) };
}

/** Request a governed decision, clarification, or data response from a host resolver. */
export function request(
  control: Extract<Action, { do: "request" }>["control"],
  data: Record<string, Json>,
  args?: Extract<Action, { do: "request" }>["args"],
): Extract<Action, { do: "request" }> {
  return { do: "request", control, data, ...(args ? { args } : {}) };
}

/** Attach a guard expression to any action (skips it unless the guard is truthy). */
export function guarded(action: Action, guard: string): Action {
  return { ...action, guard };
}

// --- Node + program constructors --------------------------------------------------

export interface NodeOptions {
  props?: Record<string, Json>;
  /** field -> source namespace path (read edge). */
  read?: Record<string, string>;
  /** field -> expression (shaped read edge). */
  readExpr?: Record<string, string>;
  /** a gate expression; the node is hidden unless it is truthy. */
  gate?: string;
  /** field -> destination namespace path (write edge). */
  write?: Record<string, string>;
  /** event name -> ordered actions (behavior edge). */
  on?: Record<string, Action[]>;
  children?: DocNode[];
}

/** Build a projection node for a vocabulary capability. Omits empty edges to stay schema-clean. */
export function node(capability: string, id: string, opts: NodeOptions = {}): DocNode {
  const edges: Edges = {};
  if (opts.read) edges.read = opts.read;
  if (opts.readExpr) edges.readExpr = opts.readExpr;
  if (opts.gate !== undefined) edges.gate = opts.gate;
  if (opts.write) {
    edges.write = Object.fromEntries(
      Object.entries(opts.write).map(([field, to]) => [field, { to }])
    );
  }
  if (opts.on) edges.on = opts.on;
  if (opts.children) edges.children = opts.children;

  const result: DocNode = { capability, id };
  if (opts.props) result.props = opts.props;
  if (Object.keys(edges).length > 0) result.edges = edges;
  return result;
}

export interface ProgramOptions {
  vocabulary?: string;
  handlers?: RuntimeHandler[];
  machines?: Machine[];
  derivations?: StandingDerivation[];
}

/** Assemble a projected program from a root node. */
export function projectedProgram(root: DocNode, opts: ProgramOptions = {}): ProjectedProgramDefinition {
  const payload: ProjectedProgramDefinition = { root };
  if (opts.vocabulary !== undefined) payload.vocabulary = opts.vocabulary;
  if (opts.handlers) payload.handlers = opts.handlers;
  if (opts.machines) payload.machines = opts.machines;
  if (opts.derivations) payload.derivations = opts.derivations;
  return payload;
}

export type HeadlessProgramOptions = ProgramOptions;

/** Assemble a headless program without a projection root. */
export function program(opts: HeadlessProgramOptions): HeadlessProgramDefinition {
  const payload: HeadlessProgramDefinition = {};
  if (opts.vocabulary !== undefined) payload.vocabulary = opts.vocabulary;
  if (opts.handlers) payload.handlers = opts.handlers;
  if (opts.machines) payload.machines = opts.machines;
  if (opts.derivations) payload.derivations = opts.derivations;
  return payload;
}

/**
 * Validate-before-commit: envelope the program and run structural schema validation.
 * Throws {@link ValidationError} on a malformed program; returns the wire message otherwise.
 */
export function authorProjectedProgram(root: DocNode, opts: ProgramOptions = {}): ProjectedProgramMessage {
  const message = envelope("program", projectedProgram(root, opts)) as ProjectedProgramMessage;
  validateProgramMessage(message);
  return message;
}

/** Validate and envelope a headless program without a projection root. */
export function authorProgram(opts: HeadlessProgramOptions): ProgramMessage {
  const message = envelope("program", program(opts)) as ProgramMessage;
  validateProgramMessage(message);
  return message;
}

// --- Reference linting (non-throwing) ---------------------------------------------

export interface LintWarning {
  code: "unknown-capability" | "undeclared-event" | "undeclared-namespace" | "undeclared-effect";
  node?: string;
  detail: string;
}

function firstSegment(path: string): string {
  return path.split(".")[0];
}

/**
 * Lint a document's references against a manifest. Returns warnings (never throws) for
 * references that are structurally valid but not backed by the vocabulary:
 * - `unknown-capability`: a node uses a capability the manifest doesn't declare (safe at
 *   runtime via graceful fallback, hence a warning).
 * - `undeclared-event`: a node handles an event the capability doesn't list in `emits`.
 * - `undeclared-namespace`: a read/write/assign path targets an undeclared namespace.
 */
export function lintVocabularyReferences(
  manifest: ProjectedVocabularyManifest,
  doc: ExecutableProgramDefinition
): LintWarning[] {
  const warnings: LintWarning[] = [];
  const namespaces = new Set(manifest.namespaces ?? []);
  // Effects are linted only when the bundle opts in by declaring `externals.effectHandlers` — the contract
  // is authoritative once present, but unmigrated bundles (no externals) are left alone.
  const declaredEffects = manifest.externals?.effectHandlers;
  const effectSet = new Set(declaredEffects ?? []);

  const checkNs = (path: string, id: string, where: string): void => {
    const ns = firstSegment(path);
    if (namespaces.size > 0 && !namespaces.has(ns)) {
      warnings.push({
        code: "undeclared-namespace",
        node: id,
        detail: `${where} references undeclared namespace '${ns}' (path '${path}')`,
      });
    }
  };

  const walk = (n: DocNode): void => {
    const cap = manifest.capabilities?.[n.capability];
    if (!cap) {
      warnings.push({
        code: "unknown-capability",
        node: n.id,
        detail: `capability '${n.capability}' is not declared in the manifest`,
      });
    }

    for (const path of Object.values(n.edges?.read ?? {})) checkNs(path, n.id, "read");
    for (const w of Object.values(n.edges?.write ?? {})) checkNs(w.to, n.id, "write");

    for (const [event, actions] of Object.entries(n.edges?.on ?? {})) {
      if (cap?.emits && !cap.emits.includes(event)) {
        warnings.push({
          code: "undeclared-event",
          node: n.id,
          detail: `handles event '${event}' not declared in capability '${n.capability}' emits`,
        });
      }
      for (const a of actions) {
        if (a.do === "assign") checkNs(a.target, n.id, "action 'assign' target");
        if (declaredEffects && a.do === "invoke") {
          const tool = a.control.tool;
          if (tool && !effectSet.has(tool)) {
            warnings.push({
              code: "undeclared-effect",
              node: n.id,
              detail: `invokes effect '${tool}' not declared in manifest externals.effectHandlers`,
            });
          }
        }
      }
    }

    for (const child of n.edges?.children ?? []) walk(child);
  };

  if (doc.root) walk(doc.root);

  const checkActions = (owner: string, actions: Action[]): void => {
    for (const action of actions) {
      if (action.do === "assign") checkNs(action.target, owner, "action 'assign' target");
      if (declaredEffects && action.do === "invoke") {
        const tool = action.control.tool;
        if (tool && !effectSet.has(tool)) {
          warnings.push({
            code: "undeclared-effect",
            node: owner,
            detail: `invokes effect '${tool}' not declared in manifest externals.effectHandlers`,
          });
        }
      }
    }
  };
  for (const handler of doc.handlers ?? []) {
    for (const actions of Object.values(handler.on)) checkActions(handler.id, actions);
  }

  for (const m of doc.machines ?? []) checkNs(m.context, m.id, `machine '${m.id}' context`);

  return warnings;
}
