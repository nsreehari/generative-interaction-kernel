// Host-addressable presentation regions: the read model over `presentation.exportedRegions`.
//
// A presentation slot and an exported region are deliberately different things. A slot is internal
// Blueprint-owned topology; an exported region is the explicit, named contract an application host
// may address. Nothing is exposed implicitly -- a host can only discover and mount what a Blueprint
// declared here, which is why this list is derived from the TERMINAL Blueprint a materialization
// selected for the current external context, never from the authored source tier.

import type {
  BlueprintArtifact,
  PresentationDefinition,
  PresentationRegionExport,
} from "./types";

/** One exported region as a host discovers it: normalized metadata, never the raw declaration. */
export interface ExportedPresentationRegion {
  readonly name: string;
  readonly slot: string;
  readonly required: boolean;
  readonly description?: string;
}

/** Legal exported region names: an application host addresses these as literal strings, so they stay
 * a conservative, deterministic character set rather than arbitrary text. */
export const PRESENTATION_REGION_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const EMPTY_REGIONS: readonly ExportedPresentationRegion[] = [];

function normalizeRegion(region: PresentationRegionExport): ExportedPresentationRegion {
  return {
    name: region.name,
    slot: region.slot,
    required: region.required === true,
    ...(region.description === undefined ? {} : { description: region.description }),
  };
}

/** The regions one presentation exports, in declaration order. */
export function listPresentationRegionExports(
  presentation: PresentationDefinition | undefined,
): readonly ExportedPresentationRegion[] {
  const exported = presentation?.exportedRegions;
  if (!exported || exported.length === 0) return EMPTY_REGIONS;
  return exported.map(normalizeRegion);
}

/** The regions a Blueprint artifact exports. Hosts pass the terminal Blueprint of a materialization,
 * so discovery always reflects the representation selected for the current external context. */
export function listExportedPresentationRegions(
  blueprint: BlueprintArtifact | undefined,
): readonly ExportedPresentationRegion[] {
  return listPresentationRegionExports(blueprint?.payload.presentation);
}

/** One exported region by host-addressable name, or `undefined` when the Blueprint does not export it. */
export function findExportedPresentationRegion(
  regions: readonly ExportedPresentationRegion[],
  name: string,
): ExportedPresentationRegion | undefined {
  return regions.find((region) => region.name === name);
}

/** Every slot's own declared parent, first declaration winning (duplicate slot ids are already a
 * compile-time error, so this read model never needs its own opinion about them). */
function slotParents(presentation: PresentationDefinition): Map<string, string | undefined> {
  const parents = new Map<string, string | undefined>();
  for (const entry of presentation.slots) {
    const id = typeof entry === "string" ? entry : entry.id;
    if (parents.has(id)) continue;
    parents.set(id, typeof entry === "string" ? undefined : entry.region);
  }
  return parents;
}

/** A slot plus its ancestors, nearest first. Cycle-safe: a malformed presentation cycle stops the
 * walk rather than hanging, and is reported by `composeCellProgram`'s own cycle check. */
function slotAncestry(parents: Map<string, string | undefined>, slot: string): string[] {
  const chain: string[] = [];
  let current: string | undefined = slot;
  while (current !== undefined && !chain.includes(current)) {
    chain.push(current);
    current = parents.get(current);
  }
  return chain;
}

/** Structural errors in one presentation's exported-region declarations, in declaration order, as
 * plain sentences the Blueprint validator raises. Every rule keeps the exported set something a host
 * can mount deterministically: a legal unique name, a real slot that is actually reachable from the
 * presentation root, and no two regions covering the same subtree (which would render one slot twice
 * once both are mounted). */
export function collectPresentationRegionExportErrors(
  presentation: PresentationDefinition,
  blueprintId: string,
): string[] {
  const exported = presentation.exportedRegions;
  if (!exported || exported.length === 0) return [];
  const errors: string[] = [];
  const parents = slotParents(presentation);
  const names = new Set<string>();
  const accepted: { name: string; slot: string; ancestry: readonly string[] }[] = [];
  for (const region of exported) {
    const name = region?.name;
    if (typeof name !== "string" || !PRESENTATION_REGION_NAME_PATTERN.test(name)) {
      errors.push(`Blueprint '${blueprintId}' presentation exports an invalid region name '${String(name)}'`);
      continue;
    }
    if (names.has(name)) {
      errors.push(`Blueprint '${blueprintId}' presentation exports region '${name}' more than once`);
      continue;
    }
    names.add(name);
    if (typeof region.slot !== "string" || !parents.has(region.slot)) {
      errors.push(`Blueprint '${blueprintId}' presentation region '${name}' exports unknown slot '${String(region.slot)}'`);
      continue;
    }
    const ancestry = slotAncestry(parents, region.slot);
    if (!ancestry.includes(presentation.root)) {
      errors.push(`Blueprint '${blueprintId}' presentation region '${name}' exports slot '${region.slot}' that is unreachable from root '${presentation.root}'`);
      continue;
    }
    const overlap = accepted.find((other) => other.ancestry.includes(region.slot) || ancestry.includes(other.slot));
    if (overlap) {
      errors.push(`Blueprint '${blueprintId}' presentation region '${name}' exports slot '${region.slot}' that overlaps region '${overlap.name}' slot '${overlap.slot}'`);
      continue;
    }
    accepted.push({ name, slot: region.slot, ancestry });
  }
  return errors;
}
