// Slice 3 — the demo-specific export bundle. The portable authored-session artifact ({interaction,
// context, edits}) lives in the workbench sample libs; this module only assembles the self-describing
// EXPORT bundle for the demo manifest: the authored artifact plus the manifest generated from its
// compiled document.

import { generateVocabulary, unwrap, type ProjectedProgramDefinition, type ProjectedVocabularyManifest } from "@gik/kernel";
import { type PresentationEdits } from "@gik/profile";
import { toAuthoredSession, type AuthoredSession } from "../libs/authoring";
import { DEMO_MANIFEST } from "../bundles/demo";
import type { Session } from "./session";

/** An export bundle: the authored artifact + the derived, self-describing compiled output. */
export interface ExportBundle {
  authored: AuthoredSession;
  manifest: ProjectedVocabularyManifest;
  document: ProjectedProgramDefinition;
}

/** Build the full export bundle: the authored artifact + the manifest generated from its document. */
export function exportBundle(session: Session, edits: PresentationEdits): ExportBundle {
  const authored = toAuthoredSession(session.spec, session.ctx, edits, session.profile);
  const catalog = unwrap(DEMO_MANIFEST).capabilities;
  const manifest = generateVocabulary(session.document, { version: "authored-live-cards/1.0", catalog });
  return { authored, manifest, document: session.document };
}

