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
  BlueprintAssemblyInput,
  BlueprintArtifact,
  BlueprintArtifactForFragmentKind,
  BlueprintCoreArtifact,
  BlueprintCoreDefinition,
  BlueprintDefinition,
  BlueprintFragmentBundle,
  BlueprintFragmentKind,
  BlueprintImplementationProgramsArtifact,
  BlueprintLowering,
  BlueprintPresentationArtifact,
  BlueprintPresentationProgramsArtifact,
  BlueprintReferenceResolver,
  BlueprintRuntimeStateArtifact,
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

export interface BlueprintValidationResult<TKind extends BlueprintFragmentKind = "assembled-blueprint"> {
  readonly ok: boolean;
  readonly fragmentKind: TKind;
  readonly blueprint?: BlueprintArtifactForFragmentKind<TKind>;
  readonly error?: BlueprintValidationError;
}

function assertBlueprintEnvelope(value: unknown): asserts value is { gik: "0.1"; type: "blueprint"; payload: Record<string, unknown> } {
  if (!value || typeof value !== "object") throw new BlueprintValidationError("Blueprint must be an object");
  const artifact = value as Partial<{ gik: "0.1"; type: "blueprint"; payload: Record<string, unknown> }>;
  if (artifact.gik !== "0.1" || artifact.type !== "blueprint" || !artifact.payload || typeof artifact.payload !== "object") {
    throw new BlueprintValidationError("Invalid Blueprint envelope");
  }
}

function assertProjectionCapabilityOwnership(tiers: ProjectionTierDefinition[]): void {
  const capabilityOwners = new Map<string, string>();
  for (const tier of tiers) {
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

function assertPresentationDefinition(presentation: BlueprintDefinition["presentation"], blueprintId: string): void {
  if (!presentation) return;
  const slotIds = new Set(presentation.slots.map((entry) => typeof entry === "string" ? entry : entry.id));
  if (!slotIds.has(presentation.root)) {
    throw new BlueprintValidationError(`Blueprint presentation root '${presentation.root}' is not a declared slot`);
  }
  for (const entry of presentation.slots) {
    const id = typeof entry === "string" ? entry : entry.id;
    const region = typeof entry === "string" ? undefined : entry.region;
    if (region !== undefined && !slotIds.has(region)) {
      throw new BlueprintValidationError(`Blueprint presentation slot '${id}' declares unknown parent region '${region}'`);
    }
  }
  for (const slotId of Object.keys(presentation.layout ?? {})) {
    if (!slotIds.has(slotId)) {
      throw new BlueprintValidationError(`Blueprint presentation.layout references unknown slot '${slotId}'`);
    }
  }
  const regionErrors = collectPresentationRegionExportErrors(presentation, blueprintId);
  if (regionErrors.length > 0) throw new BlueprintValidationError(regionErrors.join("; "));
}

function assertCellPresentationReferences(
  presentation: BlueprintDefinition["presentation"],
  cells: Record<string, BlueprintDefinition["cells"][string]> = {},
): void {
  if (!presentation) return;
  const slotIds = new Set(presentation.slots.map((entry) => typeof entry === "string" ? entry : entry.id));
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
}

function assertFragmentIdentity(blueprint: Partial<BlueprintCoreDefinition>): void {
  if (!blueprint.id || !blueprint.kind || !blueprint.version) {
    throw new BlueprintValidationError("Blueprint identity is incomplete");
  }
}

function assertFragmentCells(cells: Record<string, unknown> = {}): void {
  for (const [cellId, cell] of Object.entries(cells)) {
    const report = runDeclarativeValidators([{
      kind: "blueprint-cell",
      message: `Invalid Blueprint Cell '${cellId}'`,
    }], cell as never);
    if (!report.ok) {
      throw new BlueprintValidationError(report.errors.map(({ detail }) => detail).join("; "), report.errors);
    }
  }
}

function assertNoFragmentFields(payload: Record<string, unknown>, fragmentKind: BlueprintFragmentKind, forbidden: readonly string[]): void {
  for (const field of forbidden) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      throw new BlueprintValidationError(`Blueprint fragment '${fragmentKind}' must not declare '${field}'`);
    }
  }
}

function validateBlueprintFragmentArtifact<TKind extends Exclude<BlueprintFragmentKind, "assembled-blueprint">>(
  value: unknown,
  fragmentKind: TKind,
): asserts value is BlueprintArtifactForFragmentKind<TKind> {
  assertBlueprintEnvelope(value);
  const payload = value.payload;
  assertFragmentIdentity(payload as Partial<BlueprintCoreDefinition>);

  switch (fragmentKind) {
    case "blueprint": {
      assertNoFragmentFields(payload, fragmentKind, [
        "serviceTiers",
        "serviceRecipes",
        "projectionTiers",
        "projectionRecipes",
        "presentation",
        "services",
      ]);
      const runtime = payload.runtime;
      if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) {
        throw new BlueprintValidationError("Blueprint requires a runtime declaration");
      }
      if (Object.prototype.hasOwnProperty.call(runtime, "state") && (runtime as { state?: unknown }).state !== undefined) {
        throw new BlueprintValidationError("Blueprint fragment 'blueprint' must not declare runtime.state");
      }
      const cells = (payload.cells ?? {}) as Record<string, { id?: string }>;
      assertCellIds(cells);
      assertFragmentCells(payload.cells as Record<string, unknown> | undefined);
      return;
    }
    case "blueprint.presentation": {
      assertNoFragmentFields(payload, fragmentKind, [
        "serviceTiers",
        "serviceRecipes",
        "projectionRecipes",
        "services",
        "runtime",
        "cells",
        "contextFormSpec",
      ]);
      const projectionTiers = payload.projectionTiers;
      if (!Array.isArray(projectionTiers) || projectionTiers.length === 0) {
        throw new BlueprintValidationError("Blueprint presentation fragment requires projectionTiers");
      }
      assertProjectionCapabilityOwnership(projectionTiers as ProjectionTierDefinition[]);
      assertPresentationDefinition(payload.presentation as BlueprintDefinition["presentation"], String(payload.id));
      return;
    }
    case "blueprint.presentation-programs": {
      assertNoFragmentFields(payload, fragmentKind, [
        "serviceTiers",
        "serviceRecipes",
        "projectionTiers",
        "presentation",
        "services",
        "runtime",
        "cells",
        "contextFormSpec",
      ]);
      const projectionRecipes = payload.projectionRecipes;
      if (!Array.isArray(projectionRecipes)) {
        throw new BlueprintValidationError("Blueprint presentation-programs fragment requires projectionRecipes");
      }
      for (const recipe of projectionRecipes) {
        const report = runDeclarativeValidators([{ kind: "blueprint-projection-recipe", message: "Invalid Blueprint projection recipe" }], recipe as never);
        if (!report.ok) {
          throw new BlueprintValidationError(report.errors.map(({ detail }) => detail).join("; "), report.errors);
        }
      }
      return;
    }
    case "blueprint.implementation-programs": {
      assertNoFragmentFields(payload, fragmentKind, [
        "projectionTiers",
        "projectionRecipes",
        "presentation",
        "runtime",
        "cells",
        "contextFormSpec",
      ]);
      const blueprint = {
        id: String(payload.id),
        kind: String(payload.kind),
        version: String(payload.version),
        serviceTiers: payload.serviceTiers,
        serviceRecipes: payload.serviceRecipes,
        projectionTiers: [{ id: "placeholder", kind: "placeholder", capabilities: [] }],
        projectionRecipes: [],
        runtime: {},
      } as BlueprintDefinition;
      validateLoweringAxis(blueprint, "service");
      return;
    }
    case "blueprint.runtime-state": {
      assertNoFragmentFields(payload, fragmentKind, [
        "serviceTiers",
        "serviceRecipes",
        "projectionTiers",
        "projectionRecipes",
        "presentation",
        "services",
        "cells",
        "contextFormSpec",
      ]);
      const runtime = payload.runtime;
      if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) {
        throw new BlueprintValidationError("Blueprint runtime-state fragment requires a runtime object");
      }
      if (!Object.prototype.hasOwnProperty.call(runtime, "state")) {
        throw new BlueprintValidationError("Blueprint runtime-state fragment requires runtime.state");
      }
      return;
    }
  }
}

function isBlueprintFragmentBundle(value: BlueprintAssemblyInput): value is BlueprintFragmentBundle {
  return typeof value === "object" && value !== null && "blueprint" in value;
}

function assertMatchingFragmentIdentity(
  expected: Pick<BlueprintCoreDefinition, "id" | "kind" | "version">,
  fragment: Pick<BlueprintCoreDefinition, "id" | "kind" | "version">,
  fragmentKind: Exclude<BlueprintFragmentKind, "assembled-blueprint" | "blueprint">,
): void {
  if (fragment.id !== expected.id || fragment.kind !== expected.kind || fragment.version !== expected.version) {
    throw new BlueprintValidationError(
      `Blueprint fragment '${fragmentKind}' identity does not match '${expected.id}/${expected.version}'`,
    );
  }
}

function assembleBlueprintFragments(input: BlueprintFragmentBundle): BlueprintArtifact {
  validateBlueprintArtifact(input.blueprint, "blueprint");

  const assembled: BlueprintArtifact = {
    gik: "0.1",
    type: "blueprint",
    payload: {
      ...structuredClone(input.blueprint.payload),
      serviceTiers: [],
      serviceRecipes: [],
      projectionTiers: [],
      projectionRecipes: [],
      runtime: structuredClone(input.blueprint.payload.runtime),
    },
  };

  if (input.presentation) {
    validateBlueprintArtifact(input.presentation, "blueprint.presentation");
    assertMatchingFragmentIdentity(input.blueprint.payload, input.presentation.payload, "blueprint.presentation");
    assembled.payload.projectionTiers = structuredClone(input.presentation.payload.projectionTiers);
    assembled.payload.presentation = structuredClone(input.presentation.payload.presentation);
  }

  if (input.presentationPrograms) {
    validateBlueprintArtifact(input.presentationPrograms, "blueprint.presentation-programs");
    assertMatchingFragmentIdentity(input.blueprint.payload, input.presentationPrograms.payload, "blueprint.presentation-programs");
    assembled.payload.projectionRecipes = structuredClone(input.presentationPrograms.payload.projectionRecipes);
  }

  if (input.implementationPrograms) {
    validateBlueprintArtifact(input.implementationPrograms, "blueprint.implementation-programs");
    assertMatchingFragmentIdentity(input.blueprint.payload, input.implementationPrograms.payload, "blueprint.implementation-programs");
    assembled.payload.serviceTiers = structuredClone(input.implementationPrograms.payload.serviceTiers);
    assembled.payload.serviceRecipes = structuredClone(input.implementationPrograms.payload.serviceRecipes);
    if (input.implementationPrograms.payload.services) {
      assembled.payload.services = structuredClone(input.implementationPrograms.payload.services);
    }
  }

  if (input.runtimeState) {
    validateBlueprintArtifact(input.runtimeState, "blueprint.runtime-state");
    assertMatchingFragmentIdentity(input.blueprint.payload, input.runtimeState.payload, "blueprint.runtime-state");
    assembled.payload.runtime = {
      ...structuredClone(assembled.payload.runtime),
      state: structuredClone(input.runtimeState.payload.runtime.state),
    };
  }

  validateBlueprintArtifact(assembled);
  return assembled;
}

function toBlueprintValidationError(error: unknown): BlueprintValidationError {
  if (error instanceof BlueprintValidationError) return error;
  return new BlueprintValidationError(error instanceof Error ? error.message : String(error));
}

function cloneBlueprintLikeValue(value: unknown): unknown {
  try {
    return structuredClone(value);
  } catch (error) {
    throw new BlueprintValidationError(
      `Blueprint fragment could not be cloned: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function tryValidateBlueprintArtifactInternal<TKind extends BlueprintFragmentKind>(
  value: unknown,
  fragmentKind: TKind,
): BlueprintValidationResult<TKind> {
  try {
    validateBlueprintArtifact(value, fragmentKind);
    return { ok: true, fragmentKind, blueprint: value as BlueprintArtifactForFragmentKind<TKind> };
  } catch (error) {
    return { ok: false, fragmentKind, error: toBlueprintValidationError(error) };
  }
}

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

export function validateBlueprintArtifact(value: unknown): asserts value is BlueprintArtifact;
export function validateBlueprintArtifact<TKind extends BlueprintFragmentKind>(
  value: unknown,
  fragmentKind: TKind,
): asserts value is BlueprintArtifactForFragmentKind<TKind> {
  if (fragmentKind !== "assembled-blueprint") {
    validateBlueprintFragmentArtifact(value, fragmentKind);
    return;
  }

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
  assertBlueprintEnvelope(value);
  const artifact = value as unknown as Partial<BlueprintArtifact>;
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
    assertPresentationDefinition(blueprint.presentation, blueprint.id);
    assertCellPresentationReferences(blueprint.presentation, cells);
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
    assertProjectionCapabilityOwnership(tiers as ProjectionTierDefinition[]);
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

export function parseBlueprintJson(text: string): BlueprintArtifact;
export function parseBlueprintJson<TKind extends BlueprintFragmentKind>(
  text: string,
  fragmentKind: TKind,
): BlueprintArtifactForFragmentKind<TKind> {
  const blueprint: unknown = JSON.parse(text);
  if (fragmentKind === undefined) {
    validateBlueprintArtifact(blueprint);
    return blueprint as BlueprintArtifactForFragmentKind<TKind>;
  }
  validateBlueprintArtifact(blueprint, fragmentKind);
  return blueprint as BlueprintArtifactForFragmentKind<TKind>;
}

export function stringifyBlueprint(blueprint: BlueprintArtifact): string {
  validateBlueprintArtifact(blueprint);
  return JSON.stringify(blueprint, null, 2);
}

export function tryValidateBlueprintArtifact(value: unknown): BlueprintValidationResult<"assembled-blueprint">;
export function tryValidateBlueprintArtifact<TKind extends BlueprintFragmentKind>(
  value: unknown,
  fragmentKind: TKind,
): BlueprintValidationResult<TKind> {
  return tryValidateBlueprintArtifactInternal(value, (fragmentKind ?? "assembled-blueprint") as TKind);
}

export function validateAuthoredBlueprintFragment(value: unknown): BlueprintValidationResult<"assembled-blueprint">;
export function validateAuthoredBlueprintFragment<TKind extends BlueprintFragmentKind>(
  value: unknown,
  fragmentKind: TKind,
): BlueprintValidationResult<TKind> {
  const kind = (fragmentKind ?? "assembled-blueprint") as TKind;
  try {
    const blueprint = typeof value === "string" ? JSON.parse(value) : cloneBlueprintLikeValue(value);
    return tryValidateBlueprintArtifactInternal(blueprint, kind);
  } catch (error) {
    return {
      ok: false,
      fragmentKind: kind,
      error: toBlueprintValidationError(error),
    };
  }
}

export function assembleBlueprint(
  source: BlueprintAssemblyInput,
  resolveReference?: BlueprintReferenceResolver,
): BlueprintArtifact {
  const active = new Set<string>();
  const assemble = (input: BlueprintAssemblyInput): BlueprintArtifact => {
    const blueprint = isBlueprintFragmentBundle(input) ? assembleBlueprintFragments(input) : input;
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