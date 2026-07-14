// The authored-session artifact (ADR-0017/0018): the canonical, portable, re-runnable input to the
// interaction pipeline. An authoring session is fully described by the triple {interaction, context,
// edits} — everything downstream (presentation, document, generated manifest) is DERIVED by the pure
// pipeline. So the serialized session is exactly that triple, and any host can import one and replay
// it. This is a workbench-bundle concern (import/export of authored sessions), so it lives with the
// sample rather than leaking through the shared interaction runtime package.

import type { InteractionSpec, PresentationContext, PresentationEdits } from "../../../../profiles/genui";

/** Identity of the profile an authored session was produced against, so replay is deterministic. */
export interface ProfileIdentity {
  id: string;
  version: string;
}

/** The portable, re-runnable authored artifact — the minimal input the pipeline replays. */
export interface AuthoredSession {
  gik: "0.1";
  kind: "authored-session";
  profile: ProfileIdentity;
  interaction: InteractionSpec;
  context: PresentationContext;
  edits: PresentationEdits;
}

/** Serialize a filled interaction spec + context + edits into a portable authored artifact. */
export function toAuthoredSession(
  interaction: InteractionSpec,
  context: PresentationContext,
  edits: PresentationEdits,
  profile: ProfileIdentity
): AuthoredSession {
  return { gik: "0.1", kind: "authored-session", profile, interaction, context, edits };
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
  const profile = o.profile as ProfileIdentity | undefined;
  if (!profile || typeof profile.id !== "string" || typeof profile.version !== "string") {
    return { error: "missing profile.id / profile.version" };
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
  return { authored: { gik: "0.1", kind: "authored-session", profile, interaction, context, edits }, error: "" };
}

/** Guard a portable session against the host profile before replay; returns "" when compatible. */
export function checkAuthoredProfile(session: AuthoredSession, id: string, version: string): string {
  if (session.profile.id !== id) {
    return `authored for profile '${session.profile.id}', but this host runs '${id}'`;
  }
  if (session.profile.version !== version) {
    return `authored for '${id}' v${session.profile.version}, but this host runs v${version}`;
  }
  return "";
}
