import { validateBlueprintArtifact } from "./blueprint";
import type { BlueprintArtifact } from "./types";
import {
  resolveBlueprintExecution,
  type ResolvedBlueprint,
} from "./execution";

/** Resolve a self-contained Blueprint into its two independent lowering axes. */
export function loadBlueprint(value: unknown): ResolvedBlueprint {
  validateBlueprintArtifact(value);
  const blueprint: BlueprintArtifact = value;
  return resolveBlueprintExecution(blueprint);
}