// A typed reader for a resolved node's props.
//
// `node.props` is `Record<string, Json>` at the generic renderer boundary — a dynamic, possibly
// agent-authored document — so coercing it is legitimate boundary work. The point of this reader is
// to do that coercion in exactly ONE place: profile components then express the shape they expect
// (`p.str("label")`, `p.list<Option>("options")`) instead of repeating `String(... ?? "")`,
// `Array.isArray(...)` and `as unknown as T[]` at every call site. The single unchecked element cast
// for arrays lives here, where it belongs, not scattered across the vocabulary.

import type { Json, ResolvedNode } from "@gik/kernel";

export interface PropsReader {
  /** String prop, or `fallback` (default "") when null/undefined. */
  str(key: string, fallback?: string): string;
  /** Boolean prop with strict `=== true` semantics (absent -> false). */
  bool(key: string): boolean;
  /** Array prop as `T[]` (the caller asserts the element shape), or `[]` when not an array. */
  list<T>(key: string): T[];
  /** Object prop as `T` (the caller asserts the shape), or `fallback` when not a plain object. */
  obj<T>(key: string, fallback: T): T;
}

export function readProps(node: ResolvedNode): PropsReader {
  const props: Record<string, Json> = node.props;
  return {
    str(key, fallback = "") {
      const v = props[key];
      return v === null || v === undefined ? fallback : String(v);
    },
    bool(key) {
      return props[key] === true;
    },
    list<T>(key: string): T[] {
      const v = props[key];
      return Array.isArray(v) ? (v as T[]) : [];
    },
    obj<T>(key: string, fallback: T): T {
      const v = props[key];
      return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as T) : fallback;
    },
  };
}
