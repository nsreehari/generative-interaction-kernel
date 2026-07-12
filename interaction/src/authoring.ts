// The authored-session artifact (ADR-0017/0018): the canonical, portable, re-runnable input to the
// interaction pipeline. An authoring session is fully described by the triple {interaction, context,
// edits} — everything downstream (presentation, document, generated manifest) is DERIVED by the pure
// pipeline. So the serialized session is exactly that triple, and any host can import one and replay
// it. This lives next to the compiler that consumes it, so the artifact and its reader stay together.

import type { InteractionSpec } from "./interaction";
import type { PresentationContext } from "./presentation";
import type { PresentationEdits } from "./edits";

/** The portable, re-runnable authored artifact — the minimal input the pipeline replays. */
export interface AuthoredSession {
  gik: "0.1";
  kind: "authored-session";
  interaction: InteractionSpec;
  context: PresentationContext;
  edits: PresentationEdits;
}

/** Serialize a filled interaction spec + context + edits into a portable authored artifact. */
export function toAuthoredSession(
  interaction: InteractionSpec,
  context: PresentationContext,
  edits: PresentationEdits
): AuthoredSession {
  return { gik: "0.1", kind: "authored-session", interaction, context, edits };
}

/** The result of parsing pasted import text: the authored artifact, or a human-readable error. */
export interface ParsedImport {
  authored?: AuthoredSession;
  error: string;
}

/** Parse + shape-check pasted JSON into an AuthoredSession (boundary validation — untrusted text). */
export function parseAuthoredSession(text: string): ParsedImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "not valid JSON" };
  }
  const o = raw as Record<string, unknown>;
  const interaction = o?.interaction as InteractionSpec | undefined;
  if (!interaction || typeof interaction.interaction !== "string") {
    return { error: "missing interaction.interaction (kind)" };
  }
  const context = (o.context as PresentationContext) ?? { surface: "desktop" };
  const e = (o.edits as Partial<PresentationEdits>) ?? {};
  const edits: PresentationEdits = {
    disabled: Array.isArray(e.disabled) ? (e.disabled as string[]) : [],
    priority: (e.priority && typeof e.priority === "object" ? e.priority : {}) as PresentationEdits["priority"],
    disclosure: (e.disclosure && typeof e.disclosure === "object"
      ? e.disclosure
      : {}) as PresentationEdits["disclosure"],
    order: Array.isArray(e.order) ? (e.order as string[]) : [],
  };
  return { authored: { gik: "0.1", kind: "authored-session", interaction, context, edits }, error: "" };
}
