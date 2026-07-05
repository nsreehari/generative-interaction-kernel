// Provider contracts and in-memory reference implementations.
// These are the pluggable seams; the kernel depends only on the interfaces.

// Vendored JSONata (canonical v2.2.1) — a UMD copy default-imported so it loads under both
// Node (tsx) and the browser (Vite), with no external npm dependency and no Node `require`.
// @ts-ignore -- vendored CommonJS bundle ships no type declarations.
import jsonataFactory from "./vendor/jsonata.cjs";
import type {
  Json,
  PatchOp,
  ManifestPayload,
  CapabilityDescriptor,
  OrchestratorEffect,
  OrchestratorResult,
} from "./types";

// See ./vendor/README.md. Exposes jsonata(expr) -> { evaluate(input, bindings?) => Promise }.
// This is the same canonical source the C# port follows, so both kernels share one reference.
interface Compiled {
  evaluate(input: unknown, bindings?: Record<string, unknown>): Promise<unknown>;
  ast(): unknown;
}
const jsonata = jsonataFactory as unknown as (expr: string) => Compiled;

// ---- path helpers on a namespaced snapshot -------------------------------

export function getPath(obj: Record<string, Json>, path: string): Json {
  const parts = path.split(".");
  let cur: Json = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object" || Array.isArray(cur)) return null;
    cur = (cur as Record<string, Json>)[p];
    if (cur === undefined) return null;
  }
  return cur === undefined ? null : cur;
}

function setPath(obj: Record<string, Json>, path: string, value: Json): void {
  const parts = path.split(".");
  let cur = obj as Record<string, Json>;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = cur[p];
    if (next == null || typeof next !== "object" || Array.isArray(next)) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, Json>;
  }
  cur[parts[parts.length - 1]] = value;
}

function removePath(obj: Record<string, Json>, path: string): void {
  const parts = path.split(".");
  let cur = obj as Record<string, Json>;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]];
    if (next == null || typeof next !== "object") return;
    cur = next as Record<string, Json>;
  }
  delete cur[parts[parts.length - 1]];
}

export function applyOp(obj: Record<string, Json>, op: PatchOp): void {
  if (op.op === "remove") {
    removePath(obj, op.path);
  } else if (op.op === "merge") {
    const existing = getPath(obj, op.path);
    const base =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? (existing as Record<string, Json>)
        : {};
    setPath(obj, op.path, { ...base, ...(op.value as Record<string, Json>) });
  } else {
    setPath(obj, op.path, op.value ?? null);
  }
}

// ---- ExpressionProvider --------------------------------------------------

export interface ExpressionProvider {
  eval(expr: string, data: unknown, bindings?: Record<string, unknown>): Promise<Json>;
}

// Constructs with no legitimate place in an agent-authored *predicate* (guard / gate /
// visibility): dynamic evaluation ($eval), user-defined/recursive functions (lambda), and
// structural rewrites (transform). They are the code-injection and DoS surface. The *safe*
// provider rejects them at COMPILE time by walking the parsed AST, so an unsafe predicate
// never reaches evaluation. Enforcement is a provider capability, not a kernel concern
// (ADR-0028): the kernel stays expression-language-neutral and only routes positions to
// provider instances — it never hardcodes what "unsafe" means.
export class SafeExpressionError extends Error {
  constructor(
    readonly construct: string,
    readonly expression: string
  ) {
    super(`Unsafe expression construct "${construct}" is not allowed in a predicate position: ${expression}`);
    this.name = "SafeExpressionError";
  }
}

function denyUnsafe(node: unknown, expr: string, seen: WeakSet<object> = new WeakSet()): void {
  if (node === null || typeof node !== "object") return;
  if (seen.has(node)) return; // the optimized AST carries ancestor back-refs — guard cycles.
  seen.add(node);
  if (Array.isArray(node)) {
    for (const item of node) denyUnsafe(item, expr, seen);
    return;
  }
  const n = node as Record<string, unknown>;
  if (n.type === "lambda") throw new SafeExpressionError("function definition", expr);
  if (n.type === "transform") throw new SafeExpressionError("transform", expr);
  if (n.type === "function") {
    const proc = n.procedure as Record<string, unknown> | undefined;
    if (proc && proc.type === "variable" && proc.value === "eval") {
      throw new SafeExpressionError("$eval", expr);
    }
  }
  for (const key of Object.keys(n)) denyUnsafe(n[key], expr, seen);
}

export interface JsonataProviderOptions {
  /**
   * When true, reject `$eval`, function definitions (lambda), and `transform` at compile
   * time — the safe subset the platform wires into predicate positions by default.
   */
  safe?: boolean;
}

export class JsonataExpressionProvider implements ExpressionProvider {
  private cache = new Map<string, Compiled>();
  private readonly safe: boolean;

  constructor(opts: JsonataProviderOptions = {}) {
    this.safe = opts.safe ?? false;
  }

  async eval(expr: string, data: unknown, bindings: Record<string, unknown> = {}): Promise<Json> {
    const compiled = this.cache.get(expr) ?? this.compile(expr);
    const res = await compiled.evaluate(data, bindings);
    return res === undefined ? null : (res as Json);
  }

  private compile(expr: string): Compiled {
    const compiled = jsonata(expr);
    if (this.safe) denyUnsafe(compiled.ast(), expr);
    this.cache.set(expr, compiled);
    return compiled;
  }
}

// ---- StateModel ----------------------------------------------------------

export interface StateModel {
  snapshot(): Record<string, Json>;
  get(path: string): Json;
  apply(ops: PatchOp[]): void;
}

export class InMemoryStateModel implements StateModel {
  private data: Record<string, Json> = {};

  constructor(namespaces: string[] = []) {
    for (const ns of namespaces) this.data[ns] = {};
  }

  snapshot(): Record<string, Json> {
    return this.data;
  }

  get(path: string): Json {
    return getPath(this.data, path);
  }

  apply(ops: PatchOp[]): void {
    for (const op of ops) applyOp(this.data, op);
  }
}

// ---- CapabilityRegistry --------------------------------------------------

export interface CapabilityRegistry {
  has(type: string): boolean;
  get(type: string): CapabilityDescriptor | undefined;
}

export class ManifestRegistry implements CapabilityRegistry {
  constructor(private caps: Record<string, CapabilityDescriptor>) {}

  static fromManifest(m: ManifestPayload): ManifestRegistry {
    return new ManifestRegistry(m.capabilities ?? {});
  }

  has(type: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.caps, type);
  }

  get(type: string): CapabilityDescriptor | undefined {
    return this.caps[type];
  }
}

// ---- Orchestrator --------------------------------------------------------
// The seam where a document's invoke/confirm/navigate actions reach out to do
// real work. It owns time and side effects (tool calls, HITL approval, routing);
// the kernel and reducer stay pure. Any method may be omitted; unhandled effects
// are traced and produce no store change.

export interface Orchestrator {
  invoke?(effect: OrchestratorEffect): Promise<OrchestratorResult | void>;
  confirm?(effect: OrchestratorEffect): Promise<OrchestratorResult | void>;
  navigate?(effect: OrchestratorEffect): Promise<OrchestratorResult | void>;
}

/** Default no-op orchestrator: effects are traced but perform nothing. */
export class NullOrchestrator implements Orchestrator {}
