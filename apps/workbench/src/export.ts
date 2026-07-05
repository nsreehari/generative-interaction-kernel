// Slice 3 — export/import the authored session artifact. The workbench's whole premise is ONE shared,
// editable session artifact ({interaction, context, edits}); everything else (presentation, document,
// generated manifest) is derived by the pure pipeline. So the portable unit is exactly that artifact:
// serialize it and another host (or a later session) can replay it. The generated manifest travels with
// it so the exported document is self-describing.

import { generateManifest, unwrap, type DocumentPayload, type ManifestPayload } from "../../../kernel/src/index";
import type {
  InteractionSpec,
  PresentationContext,
  PresentationEdits,
} from "../../../interaction/src/index";
import { DEMO_MANIFEST } from "./demo";
import type { Session } from "./session";

/** The portable, re-runnable authored artifact — the minimal input the pipeline replays. */
export interface AuthoredSession {
  gup: "0.1";
  kind: "authored-session";
  interaction: InteractionSpec;
  context: PresentationContext;
  edits: PresentationEdits;
}

/** An export bundle: the authored artifact + the derived, self-describing compiled output. */
export interface ExportBundle {
  authored: AuthoredSession;
  manifest: ManifestPayload;
  document: DocumentPayload;
}

/** Serialize the live session (its filled spec + context) plus the current edits into a portable artifact. */
export function toAuthoredSession(session: Session, edits: PresentationEdits): AuthoredSession {
  return { gup: "0.1", kind: "authored-session", interaction: session.spec, context: session.ctx, edits };
}

/** Build the full export bundle: the authored artifact + the manifest generated from its document. */
export function exportBundle(session: Session, edits: PresentationEdits): ExportBundle {
  const authored = toAuthoredSession(session, edits);
  const catalog = unwrap(DEMO_MANIFEST).capabilities;
  const manifest = generateManifest(session.document, { version: "authored-live-cards/1.0", catalog });
  return { authored, manifest, document: session.document };
}

/** The result of parsing pasted import text: the authored artifact, or a human-readable error. */
export interface ParsedImport {
  authored?: AuthoredSession;
  error: string;
}

/** Parse + shape-check pasted JSON into an AuthoredSession (boundary validation — this is untrusted text). */
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
  return { authored: { gup: "0.1", kind: "authored-session", interaction, context, edits }, error: "" };
}
