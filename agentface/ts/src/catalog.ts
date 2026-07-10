// Discovery projection: turn a manifest (the profile's declared vocabulary) into a flat
// catalog an authoring agent can read — capabilities with their schemas/emits, the declared
// namespaces, and the external effect handlers. Nothing capability-specific is hardcoded; the
// manifest handed in is the single source of truth.

import { unwrap } from "../../../kernel/src/index";
import type { CapabilityDescriptor, ManifestPayload } from "../../../kernel/src/index";

export interface CatalogCapability extends CapabilityDescriptor {
  id: string;
}

export interface Catalog {
  capabilities: CatalogCapability[];
  namespaces: string[];
  effects: string[];
}

/** Project a manifest (bare payload or enveloped message) into a discovery catalog. */
export function describeCatalog(manifest: unknown): Catalog {
  const m = unwrap(manifest) as ManifestPayload;
  return {
    capabilities: Object.entries(m.capabilities ?? {}).map(([id, d]) => ({ id, ...d })),
    namespaces: m.namespaces ?? [],
    effects: m.externals?.effects ?? [],
  };
}

/** The declared state namespaces — the roots every read/write/target path must use. */
export function namespaces(manifest: unknown): string[] {
  return (unwrap(manifest) as ManifestPayload).namespaces ?? [];
}

/** The external effect handlers (legal `invoke` targets) the host must supply. */
export function effects(manifest: unknown): string[] {
  return (unwrap(manifest) as ManifestPayload).externals?.effects ?? [];
}
