// Slice 3 — the demo-specific export bundle. The portable authored-session artifact ({interaction,
// context, edits}) and its parse/serialize now live in the interaction lib (any host can import/export
// one); this module only assembles the self-describing EXPORT bundle for the workbench's demo manifest:
// the authored artifact plus the manifest generated from its compiled document.

import { generateManifest, unwrap, type DocumentPayload, type ManifestPayload } from "../../../kernel/src/index";
import {
  toAuthoredSession,
  type AuthoredSession,
  type PresentationEdits,
} from "../../../interaction/src/index";
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
  const authored = toAuthoredSession(session.spec, session.ctx, edits);
  const catalog = unwrap(DEMO_MANIFEST).capabilities;
  const manifest = generateManifest(session.document, { version: "authored-live-cards/1.0", catalog });
  return { authored, manifest, document: session.document };
}

