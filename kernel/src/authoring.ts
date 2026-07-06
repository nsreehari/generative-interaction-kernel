// Phase 7: the agent-authoring path. Agents don't hand-write JSON — they compose GUP
// documents from the manifest's vocabulary using typed constructors for the *closed*
// grammar, then get two independent safety nets:
//   1. authorDocument() runs validate-before-commit (structural schema validation) and
//      throws on a malformed document.
//   2. lintManifestReferences() returns NON-throwing warnings for references that are
//      structurally valid but semantically suspect (unknown capabilities, events a
//      capability doesn't declare, undeclared namespaces). Unknown capabilities are safe
//      at runtime via graceful fallback, so they are lint, not errors.

import { envelope } from "./types";
import type {
  Action,
  DocNode,
  DocumentMessage,
  DocumentPayload,
  Edges,
  Json,
  Machine,
  ManifestPayload,
} from "./types";
import { validateDocumentMessage } from "./validate";

// --- Action constructors (the six closed families) --------------------------------

/** Write a literal value to a namespace path. */
export function assign(target: string, value: Json): Action {
  return { do: "assign", target, args: { value } };
}

/** Write an expression's result (evaluated against state + `$event`) to a path. */
export function assignFrom(target: string, expr: string): Action {
  return { do: "assign", target, args: { from: expr } };
}

/** Derive a value from an expression and store it at a path. */
export function derive(target: string, expr: string): Action {
  return { do: "derive", target, args: { expr } };
}

/** Re-emit an event (optionally with a payload) to drive further reduction. */
export function emit(event: string, payload?: Record<string, Json>): Action {
  return payload ? { do: "emit", event, args: { payload } } : { do: "emit", event };
}

/** Request an out-of-band tool call (an Orchestrator effect, not a store write). */
export function invoke(tool: string, args?: Record<string, Json>): Action {
  return { do: "invoke", args: { tool, ...(args ?? {}) } };
}

/** Request navigation (an Orchestrator effect). */
export function navigate(to: Json, args?: Record<string, Json>): Action {
  return { do: "navigate", args: { to, ...(args ?? {}) } };
}

/** Request a human-in-the-loop confirmation (an Orchestrator effect). */
export function confirm(args?: Record<string, Json>): Action {
  return { do: "confirm", args: args ?? {} };
}

/** Attach a guard expression to any action (skips it unless the guard is truthy). */
export function guarded(action: Action, guard: string): Action {
  return { ...action, guard };
}

// --- Node + document constructors -------------------------------------------------

export interface NodeOptions {
  props?: Record<string, Json>;
  /** field -> source namespace path (read edge). */
  read?: Record<string, string>;
  /** a gate expression; the node is hidden unless it is truthy. */
  gate?: string;
  /** field -> destination namespace path (write edge). */
  write?: Record<string, string>;
  /** event name -> ordered actions (behavior edge). */
  on?: Record<string, Action[]>;
  children?: DocNode[];
}

/** Build a document node for a manifest capability. Omits empty edges to stay schema-clean. */
export function node(capability: string, id: string, opts: NodeOptions = {}): DocNode {
  const edges: Edges = {};
  if (opts.read) edges.read = opts.read;
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

export interface DocumentOptions {
  manifest?: string;
  machines?: Machine[];
}

/** Assemble a document payload from a root node. */
export function document(root: DocNode, opts: DocumentOptions = {}): DocumentPayload {
  const payload: DocumentPayload = { root };
  if (opts.manifest !== undefined) payload.manifest = opts.manifest;
  if (opts.machines) payload.machines = opts.machines;
  return payload;
}

/**
 * Validate-before-commit: envelope the document and run structural schema validation.
 * Throws {@link ValidationError} on a malformed document; returns the wire message otherwise.
 */
export function authorDocument(root: DocNode, opts: DocumentOptions = {}): DocumentMessage {
  const message = envelope("document", document(root, opts)) as DocumentMessage;
  validateDocumentMessage(message);
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
 * references that are structurally valid but not backed by the manifest vocabulary:
 * - `unknown-capability`: a node uses a capability the manifest doesn't declare (safe at
 *   runtime via graceful fallback, hence a warning).
 * - `undeclared-event`: a node handles an event the capability doesn't list in `emits`.
 * - `undeclared-namespace`: a read/write/assign path targets an undeclared namespace.
 */
export function lintManifestReferences(
  manifest: ManifestPayload,
  doc: DocumentPayload
): LintWarning[] {
  const warnings: LintWarning[] = [];
  const namespaces = new Set(manifest.namespaces ?? []);
  // Effects are linted only when the bundle opts in by declaring `externals.effects` — the contract
  // is authoritative once present, but unmigrated bundles (no externals) are left alone.
  const declaredEffects = manifest.externals?.effects;
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
    const cap = manifest.capabilities[n.capability];
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
        if (a.target) checkNs(a.target, n.id, `action '${a.do}' target`);
        if (declaredEffects && a.do === "invoke") {
          const tool = typeof a.args?.tool === "string" ? a.args.tool : undefined;
          if (tool && !effectSet.has(tool)) {
            warnings.push({
              code: "undeclared-effect",
              node: n.id,
              detail: `invokes effect '${tool}' not declared in manifest externals.effects`,
            });
          }
        }
      }
    }

    for (const child of n.edges?.children ?? []) walk(child);
  };

  walk(doc.root);

  for (const m of doc.machines ?? []) checkNs(m.context, m.id, `machine '${m.id}' context`);

  return warnings;
}
