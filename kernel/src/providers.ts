// Provider contracts and in-memory reference implementations.
// These are the pluggable seams; the kernel depends only on the interfaces.

import jsonata from "jsonata";
import type {
  Json,
  PatchOp,
  ManifestPayload,
  CapabilityDescriptor,
} from "./types";

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

interface CompiledExpr {
  evaluate(d: unknown, b?: Record<string, unknown>): Promise<Json>;
}

export class JsonataExpressionProvider implements ExpressionProvider {
  private cache = new Map<string, CompiledExpr>();

  async eval(expr: string, data: unknown, bindings: Record<string, unknown> = {}): Promise<Json> {
    const compiled = this.cache.get(expr) ?? this.compile(expr);
    const res = await compiled.evaluate(data, bindings);
    return res === undefined ? null : (res as Json);
  }

  private compile(expr: string): CompiledExpr {
    const compiled = jsonata(expr) as CompiledExpr;
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
