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
  const composition = analyzeCellComposition(Object.values(cells));
  if (composition.diagnostics.length > 0) {
    throw new BlueprintValidationError(composition.diagnostics.map(({ detail }) => detail).join("; "), composition.diagnostics);
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
        validateChildInputs(blueprint.payload.id, cellId, cell, assembledChild);
        cell.blueprint = { inline: assembledChild };
      } else {
        const assembledChild = assemble(child.inline as BlueprintArtifact<TRecipe>);
        validateChildInputs(blueprint.payload.id, cellId, cell, assembledChild);
        cell.blueprint = { inline: assembledChild };
      }
    }
    active.delete(blueprint.payload.id);
    validateBlueprintArtifact(assembled);
    return assembled;
  };
  return assemble(source);
}

function validateChildInputs(
  parentBlueprintId: string,
  cellId: string,
  cell: { potentialViews?: Record<string, { props?: Record<string, unknown>; bindings?: Record<string, unknown> }> },
  child: BlueprintArtifact,
): void {
  const supplied = new Set(Object.values(cell.potentialViews ?? {}).flatMap((view) => [
    ...Object.keys(view.props ?? {}),
    ...Object.keys(view.bindings ?? {}),
  ]));
  const missing = Object.entries(child.payload.interface?.inputs ?? {})
    .filter(([name, port]) => port.required && !supplied.has(name))
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new BlueprintValidationError(
      `Blueprint Cell '${cellId}' in '${parentBlueprintId}' is missing required child input(s): ${missing.join(", ")}`,
    );
  }
}

export function lowerBlueprint<Out extends ExecutableProgramDefinition>(
  blueprint: BlueprintArtifact,
  lowering: BlueprintLowering<Out>,
): ProgramMessageFor<Out> {
  validateBlueprintArtifact(blueprint);
  return lowerToProgram(lowering, blueprint);
}