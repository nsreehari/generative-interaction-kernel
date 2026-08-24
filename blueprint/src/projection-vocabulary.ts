import type {
  AllowedCapabilityEntry,
  BlueprintDefinition,
  CellDefinition,
  CellPotentialView,
  ProjectionTierDefinition,
} from "./types";

export interface ProjectionCapabilityUse {
  cellId: string;
  viewName: string;
  location: "primary" | `before[${number}]` | `after[${number}]` | `wrap[${number}]`;
  capability: string;
}

export interface ResolvedProjectionVocabulary {
  explicitCapabilities: ReadonlySet<string>;
  referencedTierIds: ReadonlySet<string>;
  authorizedCapabilities: ReadonlySet<string>;
}

function collectViewUses(
  out: ProjectionCapabilityUse[],
  cellId: string,
  viewName: string,
  view: CellPotentialView,
): void {
  if (view.capability) out.push({ cellId, viewName, location: "primary", capability: view.capability });
  for (const [index, decoration] of (view.before ?? []).entries()) {
    out.push({ cellId, viewName, location: `before[${index}]`, capability: decoration.capability });
  }
  for (const [index, decoration] of (view.after ?? []).entries()) {
    out.push({ cellId, viewName, location: `after[${index}]`, capability: decoration.capability });
  }
  for (const [index, decoration] of (view.wrap ?? []).entries()) {
    out.push({ cellId, viewName, location: `wrap[${index}]`, capability: decoration.capability });
  }
}

export function collectProjectionCapabilityUses(
  cells: Readonly<Record<string, CellDefinition>>,
): readonly ProjectionCapabilityUse[] {
  const out: ProjectionCapabilityUse[] = [];
  for (const [cellId, cell] of Object.entries(cells)) {
    for (const [viewName, view] of Object.entries(cell.potentialViews ?? {})) {
      collectViewUses(out, cellId, viewName, view);
    }
  }
  return out;
}

export function collectRepresentationCapabilityUses(
  blueprint: BlueprintDefinition,
): readonly (ProjectionCapabilityUse & { recipeId: string; representationId: string })[] {
  const out: (ProjectionCapabilityUse & { recipeId: string; representationId: string })[] = [];
  for (const recipe of blueprint.projectionRecipes) {
    for (const representation of recipe.representations) {
      for (const [cellId, views] of Object.entries(representation.views ?? {})) {
        const uses: ProjectionCapabilityUse[] = [];
        for (const [viewName, view] of Object.entries(views)) {
          collectViewUses(uses, cellId, viewName, view);
        }
        out.push(...uses.map((use) => ({
          ...use,
          recipeId: recipe.id,
          representationId: representation.id,
        })));
      }
      for (const [index, decorator] of (representation.decorators ?? []).entries()) {
        if (decorator.before) {
          out.push({
            recipeId: recipe.id,
            representationId: representation.id,
            cellId: "<selected>",
            viewName: "<selected>",
            location: `before[${index}]`,
            capability: decorator.before.capability,
          });
        }
        if (decorator.after) {
          out.push({
            recipeId: recipe.id,
            representationId: representation.id,
            cellId: "<selected>",
            viewName: "<selected>",
            location: `after[${index}]`,
            capability: decorator.after.capability,
          });
        }
      }
    }
  }
  return out;
}

export function resolveProjectionVocabulary(
  projectionTiers: readonly ProjectionTierDefinition[],
  entries: readonly AllowedCapabilityEntry[],
): ResolvedProjectionVocabulary {
  const tiersById = new Map(projectionTiers.map((tier) => [tier.id, tier]));
  const explicitCapabilities = new Set<string>();
  const referencedTierIds = new Set<string>();
  const authorizedCapabilities = new Set<string>();

  for (const entry of entries) {
    if (typeof entry === "string") {
      explicitCapabilities.add(entry);
      authorizedCapabilities.add(entry);
      continue;
    }
    const tier = tiersById.get(entry.tier);
    if (!tier) throw new Error(`presentation.allowedCapabilities references unknown projection tier '${entry.tier}'`);
    referencedTierIds.add(tier.id);
    for (const capability of tier.capabilities) authorizedCapabilities.add(capability);
  }

  return { explicitCapabilities, referencedTierIds, authorizedCapabilities };
}

export function allowedCapabilitiesAtTier(
  projectionTiers: readonly ProjectionTierDefinition[],
  targetTierId: string,
  vocabulary: ResolvedProjectionVocabulary,
): ReadonlySet<string> {
  const targetIndex = projectionTiers.findIndex((tier) => tier.id === targetTierId);
  if (targetIndex < 0) throw new Error(`Unknown projection tier '${targetTierId}'`);
  const allowed = new Set(vocabulary.explicitCapabilities);
  for (const tier of projectionTiers.slice(targetIndex)) {
    if (!vocabulary.referencedTierIds.has(tier.id)) continue;
    for (const capability of tier.capabilities) allowed.add(capability);
  }
  return allowed;
}
