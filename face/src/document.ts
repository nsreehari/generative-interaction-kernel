// The document authoring surface: validate-before-commit (structural) plus non-throwing
// reference linting against a manifest. A thin JSON-shaped facade over the kernel's
// authorDocument + lintManifestReferences, so MCP/HTTP/in-proc wrappers can share one contract.
// Nothing is hardcoded per profile: every check is relative to the manifest handed in.

import {
  authorDocument as kernelAuthorDocument,
  envelope,
  lintManifestReferences,
  unwrap,
  validateDocumentMessage,
  ValidationError,
} from "../../kernel/src/index";
import type { DocumentPayload, LintWarning, ManifestPayload } from "../../kernel/src/index";

export interface DocumentReport {
  ok: boolean;
  errors: { detail: string }[];
  warnings: LintWarning[];
}

export interface AuthorResult {
  ok: boolean;
  message?: unknown;
  warnings: LintWarning[];
  error?: string;
}

function asMessage(e: unknown): string {
  return e instanceof ValidationError ? e.message : String(e);
}

/** Dry-run a document against a manifest without committing. Never throws: structural errors and
 *  reference warnings are both returned as data (the shape an MCP `validate_document` tool wants). */
export function validateDocument(manifest: unknown, documentPayload: unknown): DocumentReport {
  const doc = unwrap(documentPayload) as DocumentPayload;
  const errors: { detail: string }[] = [];
  try {
    validateDocumentMessage(envelope("document", doc));
  } catch (e) {
    errors.push({ detail: asMessage(e) });
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings: lintManifestReferences(unwrap(manifest) as ManifestPayload, doc),
  };
}

/** Reference lint only (non-throwing) — unknown-capability / undeclared-event / -namespace / -effect. */
export function lint(manifest: unknown, documentPayload: unknown): LintWarning[] {
  return lintManifestReferences(
    unwrap(manifest) as ManifestPayload,
    unwrap(documentPayload) as DocumentPayload
  );
}

/** Commit path: structural validate-before-commit, then return the wire message. A manifest is
 *  optional; when supplied, reference warnings ride along. Errors are returned as data, not thrown. */
export function authorDocument(documentPayload: unknown, manifest?: unknown): AuthorResult {
  const doc = unwrap(documentPayload) as DocumentPayload;
  const warnings = manifest
    ? lintManifestReferences(unwrap(manifest) as ManifestPayload, doc)
    : [];
  try {
    const message = kernelAuthorDocument(doc.root, {
      manifest: doc.manifest,
      machines: doc.machines,
    });
    return { ok: true, message, warnings };
  } catch (e) {
    return { ok: false, error: asMessage(e), warnings };
  }
}
