// Slice 3 — the demo-specific export bundle. The portable authored-session artifact ({interaction,
// context, edits}) lives in the workbench sample libs; this module only assembles the self-describing
// EXPORT bundle for the demo manifest: the authored artifact plus the manifest generated from its
// compiled document.

import { generateManifest, unwrap, type DocumentPayload, type ManifestPayload } from "@gik/kernel";
import { type PresentationEdits } from "@gik/profile-genui";
import { toAuthoredSession, type AuthoredSession } from "./projection_views/libs/authoring";
import { DEMO_MANIFEST } from "./bundles/demo/demo";
import type { Session } from "./session";

/** An export bundle: the authored artifact + the derived, self-describing compiled output. */
export interface ExportBundle {
  authored: AuthoredSession;
  manifest: ManifestPayload;
  document: DocumentPayload;
}

/** Build the full export bundle: the authored artifact + the manifest generated from its document. */
export function exportBundle(session: Session, edits: PresentationEdits): ExportBundle {
  const authored = toAuthoredSession(session.spec, session.ctx, edits, session.profile);
  const catalog = unwrap(DEMO_MANIFEST).capabilities;
  const manifest = generateManifest(session.document, { version: "authored-live-cards/1.0", catalog });
  return { authored, manifest, document: session.document };
}

