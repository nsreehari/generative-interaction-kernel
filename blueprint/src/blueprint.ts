import { lowerToProgram, type ExecutableProgramDefinition, type ProgramMessageFor } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import { analyzeCellComposition } from "./cells";
import type {
  BlueprintArtifact,
  BlueprintDefinition,
  BlueprintLowering,
  BlueprintReferenceResolver,
  LoweringRecipeDefinition,
} from "./types";
import { resolveBlueprintExecution } from "./execution";

export class BlueprintValidationError extends Error {
  constructor(message: string, readonly errors: readonly unknown[] = []) {
    super(message);
    this.name = "BlueprintValidationError";
  }
}

export interface BlueprintAuthoringValidationReport {
  valid: boolean;
  artifact: BlueprintArtifact | null;
  errors: string[];
  warnings: string[];
  execution: {
    sourceTier: string;
    terminalTier: string;
    stages: Array<{ id: string; from: string; to: string }>;
    status: "invalid" | "runtime-ready" | "lowering-required";
  };
}

export function validateBlueprintForAuthoring(value: unknown): BlueprintAuthoringValidationReport {
  try {
    const artifact = typeof value === "string"
      ? parseBlueprintJson(value)
      : structuredClone(value) as unknown;
    validateBlueprintArtifact(artifact);
    const resolved = resolveBlueprintExecution(artifact);
    const stages = resolved.stages.map(({ recipe, fromTier, toTier }) => ({
      id: recipe.id,
      from: fromTier.id,
      to: toTier.id,
    }));
    return {
      valid: true,
      artifact,
      errors: [],
      warnings: [],
      execution: {
        sourceTier: stages[0]?.from ?? artifact.payload.tiers[0]?.id ?? "",
        terminalTier: stages.at(-1)?.to ?? artifact.payload.tiers[0]?.id ?? "",
        stages,
        status: stages.length > 0 ? "lowering-required" : "runtime-ready",
      },
    };
  } catch (error) {
    return {
      valid: false,
      artifact: null,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      execution: {
        sourceTier: "",
        terminalTier: "",
        stages: [],
        status: "invalid",
      },
    };
  }
}

export function validateBlueprintArtifact<TRecipe extends LoweringRecipeDefinition = LoweringRecipeDefinition>(
  value: unknown,
): asserts value is BlueprintArtifact<TRecipe> {
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
  if (!Array.isArray(blueprint.tiers) || blueprint.tiers.length === 0) throw new BlueprintValidationError("Blueprint requires at least one tier");
  if (!Array.isArray(blueprint.recipes)) throw new BlueprintValidationError("Blueprint recipes must be an array");
  if (!blueprint.runtime || typeof blueprint.runtime !== "object") {
    throw new BlueprintValidationError("Blueprint requires a runtime declaration");
  }

  const cells = blueprint.cells ?? {};
  for (const [cellId, cell] of Object.entries(cells)) {
    if (cell.id !== cellId) throw new BlueprintValidationError(`Blueprint cell key '${cellId}' does not match id '${cell.id}'`);
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
  const allowedCapabilities = blueprint.presentation?.allowedCapabilities;
  if (allowedCapabilities) {
    const allowed = new Set(allowedCapabilities);
    for (const [cellId, cell] of Object.entries(cells)) {
      for (const [viewName, view] of Object.entries(cell.potentialViews ?? {})) {
        for (const capability of [view.capability, ...(view.before ?? []).map((d) => d.capability), ...(view.after ?? []).map((d) => d.capability)]) {
          if (capability !== undefined && !allowed.has(capability)) {
            throw new BlueprintValidationError(`Blueprint Cell '${cellId}' view '${viewName}' uses capability '${capability}' not in presentation.allowedCapabilities`);
          }
        }
      }
    }
  }

  const tierIds = new Set<string>();
  for (const tier of blueprint.tiers) {
    if (!tier.id || !tier.kind) throw new BlueprintValidationError("Blueprint tier identity is incomplete");
    if (tierIds.has(tier.id)) throw new BlueprintValidationError(`Duplicate blueprint tier '${tier.id}'`);
    tierIds.add(tier.id);
  }
  const recipeIds = new Set<string>();
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const recipe of blueprint.recipes) {
    if (!recipe.id || !recipe.from || !recipe.to) throw new BlueprintValidationError("Blueprint lowering recipe is incomplete");
    if (recipeIds.has(recipe.id)) throw new BlueprintValidationError(`Duplicate blueprint lowering recipe '${recipe.id}'`);
    if (!tierIds.has(recipe.from)) throw new BlueprintValidationError(`Blueprint lowering recipe '${recipe.id}' starts from unknown tier '${recipe.from}'`);
    if (!tierIds.has(recipe.to)) throw new BlueprintValidationError(`Blueprint lowering recipe '${recipe.id}' targets unknown tier '${recipe.to}'`);
    recipeIds.add(recipe.id);
    outgoing.set(recipe.from, (outgoing.get(recipe.from) ?? 0) + 1);
    incoming.set(recipe.to, (incoming.get(recipe.to) ?? 0) + 1);
  }
  if (blueprint.recipes.length > 0) {
    const sourceTiers = blueprint.tiers.filter((tier) => !incoming.has(tier.id));
    const terminalTiers = blueprint.tiers.filter((tier) => !outgoing.has(tier.id));
    if (sourceTiers.length !== 1 || terminalTiers.length !== 1) {
      throw new BlueprintValidationError("Blueprint lowering recipes must form one connected tier chain");
    }
    for (const tier of blueprint.tiers) {
      if ((incoming.get(tier.id) ?? 0) > 1 || (outgoing.get(tier.id) ?? 0) > 1) {
        throw new BlueprintValidationError(`Blueprint tier '${tier.id}' branches or merges`);
      }
    }
  }
}

export function createBlueprint<TRecipe extends LoweringRecipeDefinition = LoweringRecipeDefinition>(
  definition: BlueprintDefinition<TRecipe>,
): BlueprintArtifact<TRecipe> {
  const blueprint: BlueprintArtifact<TRecipe> = { gik: "0.1", type: "blueprint", payload: structuredClone(definition) };
  validateBlueprintArtifact(blueprint);
  return blueprint;
}

export function parseBlueprintJson<TRecipe extends LoweringRecipeDefinition = LoweringRecipeDefinition>(text: string): BlueprintArtifact<TRecipe> {
  const blueprint: unknown = JSON.parse(text);
  validateBlueprintArtifact<TRecipe>(blueprint);
  return blueprint;
}

export function stringifyBlueprint<TRecipe extends LoweringRecipeDefinition = LoweringRecipeDefinition>(blueprint: BlueprintArtifact<TRecipe>): string {
  validateBlueprintArtifact(blueprint);
  return JSON.stringify(blueprint, null, 2);
}

export function assembleBlueprint<TRecipe extends LoweringRecipeDefinition = LoweringRecipeDefinition>(
  source: BlueprintArtifact<TRecipe>,
  resolveReference?: BlueprintReferenceResolver<TRecipe>,
): BlueprintArtifact<TRecipe> {
  const active = new Set<string>();
  const assemble = (blueprint: BlueprintArtifact<TRecipe>): BlueprintArtifact<TRecipe> => {
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
        const assembledChild = assemble(child.inline as BlueprintArtifact<TRecipe>);
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