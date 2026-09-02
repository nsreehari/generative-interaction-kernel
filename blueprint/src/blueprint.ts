import { lowerToProgram, type ExecutableProgramDefinition, type ProgramMessageFor } from "gik-kernel";
import { runDeclarativeValidators } from "gik-evaluators";
import { analyzeCellComposition } from "./cells";
import {
  collectProjectionCapabilityUses,
  collectRepresentationCapabilityUses,
  resolveProjectionVocabulary,
} from "./projection-vocabulary";
import { collectPresentationRegionExportErrors } from "./presentation-regions";
import type {
  BlueprintArtifact,
  BlueprintDefinition,
  BlueprintLowering,
  BlueprintReferenceResolver,
  LoweringRecipeDefinition,
  ProjectionTierDefinition,
  TierDefinition,
} from "./types";
import { resolveBlueprintExecution, resolveLoweringAxis } from "./execution";

export class BlueprintValidationError extends Error {
  constructor(message: string, readonly errors: readonly unknown[] = []) {
    super(message);
    this.name = "BlueprintValidationError";
  }
}

/** One lowering axis' authored chain, as reported to an authoring agent. */
export interface BlueprintAuthoringAxisReport {
  sourceTier: string;
  terminalTier: string;
  stages: Array<{ id: string; from: string; to: string }>;
}

export interface BlueprintAuthoringValidationReport {
  valid: boolean;
  artifact: BlueprintArtifact | null;
  errors: string[];
  warnings: string[];
  execution: {
    /** Applied first during materialization. */
    service: BlueprintAuthoringAxisReport;
    /** Applied second, over the already-selected terminal implementation. */
    projection: BlueprintAuthoringAxisReport;
    status: "invalid" | "runtime-ready" | "lowering-required";
  };
}

const EMPTY_AXIS_REPORT: BlueprintAuthoringAxisReport = { sourceTier: "", terminalTier: "", stages: [] };

export function validateBlueprintForAuthoring(value: unknown): BlueprintAuthoringValidationReport {
  try {
    const artifact = typeof value === "string"
      ? parseBlueprintJson(value)
      : structuredClone(value) as unknown;
    validateBlueprintArtifact(artifact);
    const resolved = resolveBlueprintExecution(artifact);
    const axisReport = (axis: typeof resolved.service | typeof resolved.projection): BlueprintAuthoringAxisReport => ({
      sourceTier: axis.sourceTier.id,
      terminalTier: axis.terminalTier.id,
      stages: axis.stages.map(({ recipe, fromTier, toTier }) => ({
        id: recipe.id,
        from: fromTier.id,
        to: toTier.id,
      })),
    });
    const service = axisReport(resolved.service);
    const projection = axisReport(resolved.projection);
    return {
      valid: true,
      artifact,
      errors: [],
      warnings: [],
      execution: {
        service,
        projection,
        status: service.stages.length + projection.stages.length > 0 ? "lowering-required" : "runtime-ready",
      },
    };
  } catch (error) {
    return {
      valid: false,
      artifact: null,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      execution: {
        service: { ...EMPTY_AXIS_REPORT, stages: [] },
        projection: { ...EMPTY_AXIS_REPORT, stages: [] },
        status: "invalid",
      },
    };
  }
}

export function validateBlueprintArtifact(
  value: unknown,
): asserts value is BlueprintArtifact {
  const report = runDeclarativeValidators([{
    kind: "blueprint",
    message: "Invalid Blueprint artifact",
  }], value as never);
  if (!report.ok) {
    throw new BlueprintValidationError(
      report.errors.map(({ detail }) => detail).join("; "),
      report.errors,
    );
  }
  if (!value || typeof value !== "object") throw new BlueprintValidationError("Blueprint must be an object");
  const artifact = value as Partial<BlueprintArtifact>;
  if (artifact.gik !== "0.1" || artifact.type !== "blueprint" || !artifact.payload) {
    throw new BlueprintValidationError("Invalid Blueprint envelope");
  }
  const blueprint = artifact.payload as BlueprintDefinition;
  if (!blueprint.id || !blueprint.kind || !blueprint.version) throw new BlueprintValidationError("Blueprint identity is incomplete");
  // Hard cut: the pre-split combined `tiers`/`recipes` pair is rejected outright rather than
  // normalized, so a stale Blueprint fails loudly instead of silently materializing one axis.
  for (const legacy of ["tiers", "recipes"] as const) {
    if (legacy in (blueprint as unknown as Record<string, unknown>)) {
      throw new BlueprintValidationError(
        `Blueprint declares removed field '${legacy}'; author serviceTiers, serviceRecipes, projectionTiers, and projectionRecipes instead`,
      );
    }
  }
  validateLoweringAxis(blueprint, "service");
  validateLoweringAxis(blueprint, "projection");
  if (!blueprint.runtime || typeof blueprint.runtime !== "object") {
    throw new BlueprintValidationError("Blueprint requires a runtime declaration");
  }

  const cells = blueprint.cells ?? {};
  for (const [cellId, cell] of Object.entries(cells)) {
    if (cell.id !== cellId) throw new BlueprintValidationError(`Blueprint cell key '${cellId}' does not match id '${cell.id}'`);
  }
  const authoredCapabilityUses = collectProjectionCapabilityUses(cells);
  const representationCapabilityUses = collectRepresentationCapabilityUses(blueprint);
  if (!blueprint.presentation && (authoredCapabilityUses.length > 0 || representationCapabilityUses.length > 0)) {
    throw new BlueprintValidationError("Blueprints with potential views or projection representation views require a presentation");
  }
  if (blueprint.presentation) {
    const slotIds = new Set(blueprint.presentation.slots.map((entry) => typeof entry === "string" ? entry : entry.id));
    if (!slotIds.has(blueprint.presentation.root)) {
      throw new BlueprintValidationError(`Blueprint presentation root '${blueprint.presentation.root}' is not a declared slot`);
    }
    for (const entry of blueprint.presentation.slots) {
      const id = typeof entry === "string" ? entry : entry.id;
      const region = typeof entry === "string" ? undefined : entry.region;
      if (region !== undefined && !slotIds.has(region)) {
        throw new BlueprintValidationError(`Blueprint presentation slot '${id}' declares unknown parent region '${region}'`);
      }
    }
    for (const [cellId, cell] of Object.entries(cells)) {
      for (const [viewName, view] of Object.entries(cell.potentialViews ?? {})) {
        const cellRegion = view.region;
        if (cellRegion === undefined) continue;
        for (const targetSlot of Array.isArray(cellRegion) ? cellRegion : [cellRegion]) {
          if (!slotIds.has(targetSlot)) {
            throw new BlueprintValidationError(`Blueprint Cell '${cellId}' view '${viewName}' attaches to unknown region '${targetSlot}'`);
          }
        }
      }
    }
    for (const slotId of Object.keys(blueprint.presentation.layout ?? {})) {
      if (!slotIds.has(slotId)) {
        throw new BlueprintValidationError(`Blueprint presentation.layout references unknown slot '${slotId}'`);
      }
    }
    // Exported regions are the only host-addressable presentation contract, so they are validated
    // structurally here rather than discovered leniently at mount time: a host must be able to trust
    // that every declared name resolves to exactly one reachable, non-overlapping slot subtree.
    const regionErrors = collectPresentationRegionExportErrors(blueprint.presentation, blueprint.id);
    if (regionErrors.length > 0) throw new BlueprintValidationError(regionErrors.join("; "));
  }
  // `blueprint` (hosting another Blueprint) is one of a Cell's own ordinary data-flow-owning
  // properties -- listed alongside ports/sources/compute/behavior, not alongside `potentialViews` --
  // and its declared outputs "surface as this Cell's own outputs, exactly like any other Cell". A
  // hosted child's required `interface.inputs` are therefore supplied the same way any other Cell
  // consumes state: through this Cell's own declared `inputs` ports (by `input.as ?? input.token`
  // name), never through `potentialViews`/bindings/region/presentation. Presentation is a fully
  // independent, optional concern -- whether (and how) a Cell's data happens to also render is never
  // allowed to gate whether its data flow (including hosting) functions. Because a Cell's ports never
  // change across lowering (the one invariant every tier shares), this check needs no "wait until
  // terminal" gating: it is accurate at every validation call, always.
  for (const [cellId, cell] of Object.entries(cells)) {
    const hosted = cell.blueprint;
    if (!hosted || !("inline" in hosted) || !hosted.inline) continue;
    const child = hosted.inline;
    const supplied = new Set((cell.inputs ?? []).map((input) => input.as ?? input.token));
    const missing = Object.entries(child.payload.interface?.inputs ?? {})
      .filter(([name, port]) => port.required && !supplied.has(name))
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new BlueprintValidationError(
        `Blueprint Cell '${cellId}' in '${blueprint.id}' is missing required child input(s): ${missing.join(", ")}`,
      );
    }
  }
  const composition = analyzeCellComposition(Object.values(cells));
  if (composition.diagnostics.length > 0) {
    throw new BlueprintValidationError(composition.diagnostics.map(({ detail }) => detail).join("; "), composition.diagnostics);
  }
  for (const [cellId, cell] of Object.entries(cells)) {
    for (const source of cell.sources ?? []) {
      const service = blueprint.services?.[source.service];
      if (!service) {
        throw new BlueprintValidationError(`Blueprint Cell '${cellId}' source '${source.id}' references unknown service '${source.service}'`);
      }
      if (!service.operations?.[source.operation]) {
        throw new BlueprintValidationError(`Blueprint Cell '${cellId}' source '${source.id}' references unknown operation '${source.operation}' on service '${source.service}'`);
      }
    }
  }
  if (blueprint.presentation) {
    let vocabulary;
    try {
      vocabulary = resolveProjectionVocabulary(
        blueprint.projectionTiers,
        blueprint.presentation.allowedCapabilities,
      );
    } catch (error) {
      throw new BlueprintValidationError(error instanceof Error ? error.message : String(error));
    }
    for (const use of authoredCapabilityUses) {
      if (!vocabulary.authorizedCapabilities.has(use.capability)) {
        throw new BlueprintValidationError(
          `Blueprint Cell '${use.cellId}' view '${use.viewName}' ${use.location} uses capability '${use.capability}' not in presentation.allowedCapabilities`,
        );
      }
    }
    for (const use of representationCapabilityUses) {
      if (!vocabulary.authorizedCapabilities.has(use.capability)) {
        throw new BlueprintValidationError(
          `Projection recipe '${use.recipeId}' representation '${use.representationId}' Cell '${use.cellId}' view '${use.viewName}' ${use.location} uses capability '${use.capability}' not in presentation.allowedCapabilities`,
        );
      }
    }
    for (const recipe of blueprint.projectionRecipes) {
      for (const representation of recipe.representations) {
        for (const cellId of Object.keys(representation.views ?? {})) {
          if (!cells[cellId]) {
            throw new BlueprintValidationError(
              `Projection recipe '${recipe.id}' representation '${representation.id}' references unknown Cell '${cellId}'`,
            );
          }
        }
        for (const cellId of Object.keys(representation.removeViews ?? {})) {
          if (!cells[cellId]) {
            throw new BlueprintValidationError(
              `Projection recipe '${recipe.id}' representation '${representation.id}' removes views from unknown Cell '${cellId}'`,
            );
          }
        }
      }
    }
  }
}

/** Both axes are validated by this one function, so `service` and `projection` are held to exactly
 * the same chain invariants: unique tier ids, unique recipe ids, known endpoints, no branching or
 * merging, and — when the axis declares recipes — exactly one source and one terminal tier. */
function validateLoweringAxis(blueprint: BlueprintDefinition, axis: "service" | "projection"): void {
  const tiers: TierDefinition[] | undefined = axis === "service" ? blueprint.serviceTiers : blueprint.projectionTiers;
  const recipes: LoweringRecipeDefinition[] | undefined = axis === "service" ? blueprint.serviceRecipes : blueprint.projectionRecipes;
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new BlueprintValidationError(`Blueprint requires at least one ${axis} tier`);
  }
  if (!Array.isArray(recipes)) {
    throw new BlueprintValidationError(`Blueprint ${axis}Recipes must be an array`);
  }

  if (axis === "projection") {
    const capabilityOwners = new Map<string, string>();
    for (const tier of tiers as ProjectionTierDefinition[]) {
      for (const capability of tier.capabilities) {
        const owner = capabilityOwners.get(capability);
        if (owner) {
          throw new BlueprintValidationError(
            `Blueprint projection capability '${capability}' is declared by both tiers '${owner}' and '${tier.id}'`,
          );
        }
        capabilityOwners.set(capability, tier.id);
      }
    }
  }
  try {
    resolveLoweringAxis(blueprint.id, axis, tiers, recipes);
  } catch (error) {
    throw new BlueprintValidationError(error instanceof Error ? error.message : String(error));
  }
}

export function createBlueprint(definition: BlueprintDefinition): BlueprintArtifact {
  const blueprint: BlueprintArtifact = { gik: "0.1", type: "blueprint", payload: structuredClone(definition) };
  validateBlueprintArtifact(blueprint);
  return blueprint;
}

export function parseBlueprintJson(text: string): BlueprintArtifact {
  const blueprint: unknown = JSON.parse(text);
  validateBlueprintArtifact(blueprint);
  return blueprint;
}

export function stringifyBlueprint(blueprint: BlueprintArtifact): string {
  validateBlueprintArtifact(blueprint);
  return JSON.stringify(blueprint, null, 2);
}

export function assembleBlueprint(
  source: BlueprintArtifact,
  resolveReference?: BlueprintReferenceResolver,
): BlueprintArtifact {
  const active = new Set<string>();
  const assemble = (blueprint: BlueprintArtifact): BlueprintArtifact => {
    validateBlueprintArtifact(blueprint);
    if (active.has(blueprint.payload.id)) throw new BlueprintValidationError(`Recursive Blueprint reference cycle at '${blueprint.payload.id}'`);
    active.add(blueprint.payload.id);
    const assembled = structuredClone(blueprint);
    for (const [cellId, cell] of Object.entries(assembled.payload.cells ?? {})) {
      const child = cell.blueprint;
      if (!child) continue;
      if ("$ref" in child) {
        const ref = child.$ref;
        if (typeof ref !== "string") continue;
        if (!resolveReference) throw new BlueprintValidationError(`Blueprint Cell '${cellId}' has unresolved reference '${ref}'`);
        const assembledChild = assemble(resolveReference(ref, { parentBlueprintId: blueprint.payload.id, cellId }));
        cell.blueprint = { inline: assembledChild };
      } else {
        const assembledChild = assemble(child.inline as BlueprintArtifact);
        cell.blueprint = { inline: assembledChild };
      }
    }
    active.delete(blueprint.payload.id);
    // Every embedded child is now inline, so this same validateBlueprintArtifact call already checks
    // hosted-child input satisfaction (among everything else) at this level -- no separate call needed.
    validateBlueprintArtifact(assembled);
    return assembled;
  };
  return assemble(source);
}

export function lowerBlueprint<Out extends ExecutableProgramDefinition>(
  blueprint: BlueprintArtifact,
  lowering: BlueprintLowering<Out>,
): ProgramMessageFor<Out> {
  validateBlueprintArtifact(blueprint);
  return lowerToProgram(lowering, blueprint);
}