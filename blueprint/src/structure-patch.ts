import type { ProgramPatch } from "gik-kernel";
import { validateBlueprintArtifact } from "./blueprint";
import type {
  BlueprintArtifact,
  BlueprintPatch,
  BlueprintPatchDecision,
  BlueprintPatchRequest,
} from "./types";

export class BlueprintStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlueprintStructureError";
  }
}

function modeOf(blueprint: BlueprintArtifact) {
  return blueprint.payload.structureMode ?? "fixed";
}

function hasChildBlueprint(patch: BlueprintPatch): boolean {
  return patch.some((operation) =>
    (operation.op === "addCell" || operation.op === "replaceCell")
    && operation.cell.blueprint !== undefined);
}

/** Decide whether a semantic Blueprint patch may proceed under the authored structure mode. */
export function admitBlueprintPatch(
  blueprint: BlueprintArtifact,
  request: BlueprintPatchRequest,
): BlueprintPatchDecision {
  validateBlueprintArtifact(blueprint);
  if (modeOf(blueprint) === "fixed") return { accepted: false, reason: "fixed-structure" };
  if (modeOf(blueprint) === "reconfigurable") {
    return request.origin === "authorized"
      ? { accepted: true, patch: request.patch }
      : { accepted: false, reason: "authorization-required" };
  }
  const allowed = new Set(blueprint.payload.structurePolicy?.allowedBlueprintOperations ?? []);
  return request.patch.every(({ op }) => allowed.has(op))
    ? { accepted: true, patch: request.patch }
    : { accepted: false, reason: "policy-rejected" };
}

/** Admit a runtime-originated executable patch only for an adaptive Blueprint policy. */
export function admitAdaptiveProgramPatch(
  blueprint: BlueprintArtifact,
  patch: ProgramPatch,
): ProgramPatch | false {
  validateBlueprintArtifact(blueprint);
  if (modeOf(blueprint) !== "adaptive") return false;
  const allowed = new Set(blueprint.payload.structurePolicy?.allowedProgramOperations ?? []);
  return patch.every(({ op }) => allowed.has(op)) ? patch : false;
}

/** Apply an admitted, non-nested semantic patch to a clone and validate the complete result. */
export function applyBlueprintPatch(
  blueprint: BlueprintArtifact,
  patch: BlueprintPatch,
): BlueprintArtifact {
  validateBlueprintArtifact(blueprint);
  if (patch.length === 0) throw new BlueprintStructureError("Blueprint patch must contain at least one operation");
  if (hasChildBlueprint(patch)) {
    throw new BlueprintStructureError("Nested child Blueprint mutations are not supported");
  }
  const next = structuredClone(blueprint);
  for (const operation of patch) {
    switch (operation.op) {
      case "addCell":
        if (next.payload.cells?.[operation.cell.id]) {
          throw new BlueprintStructureError(`Blueprint already contains Cell '${operation.cell.id}'`);
        }
        next.payload.cells = { ...(next.payload.cells ?? {}), [operation.cell.id]: structuredClone(operation.cell) };
        break;
      case "replaceCell":
        if (!next.payload.cells?.[operation.cellId]) {
          throw new BlueprintStructureError(`Blueprint does not contain Cell '${operation.cellId}'`);
        }
        if (operation.cell.id !== operation.cellId) {
          throw new BlueprintStructureError(`Replacement Cell id '${operation.cell.id}' does not match '${operation.cellId}'`);
        }
        next.payload.cells[operation.cellId] = structuredClone(operation.cell);
        break;
      case "removeCell":
        if (next.payload.cells) delete next.payload.cells[operation.cellId];
        break;
      case "setPresentation":
        next.payload.presentation = structuredClone(operation.presentation);
        break;
    }
  }
  validateBlueprintArtifact(next);
  return next;
}