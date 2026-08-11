import { parseBlueprintReference } from "./blueprint-reference";
import type {
  BlueprintArtifact,
  BlueprintHostRegistry,
  CellBlueprint,
  HostedBlueprintDefinition,
  HostedBlueprintResolutionContext,
} from "./types";
import type { Json } from "@gik/kernel";

export const HOSTED_BLUEPRINT_CAPABILITY = "gik:hosted-blueprint";

export function readHostedBlueprintDeclaration(value: Json | undefined): CellBlueprint | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  if (typeof value.$ref === "string" && value.inline === undefined) {
    return { $ref: value.$ref };
  }
  if (value.$ref === undefined && value.inline && typeof value.inline === "object" && !Array.isArray(value.inline)) {
    return { inline: value.inline as unknown as BlueprintArtifact };
  }
  return undefined;
}

export async function resolveHostedBlueprint<TNative = unknown>(
  declaration: CellBlueprint,
  registry: BlueprintHostRegistry<TNative> | undefined,
  context: HostedBlueprintResolutionContext,
): Promise<HostedBlueprintDefinition<TNative>> {
  if (declaration.inline) {
    const inline = inlineHostedBlueprint<TNative>(declaration.inline);
    if (!registry) return inline;
    const registered = await registry.resolve(inline.reference, context);
    return { ...registered, blueprint: declaration.inline };
  }
  if (!registry) {
    throw new Error(`No Blueprint host registry can resolve '${declaration.$ref}'`);
  }

  const reference = parseBlueprintReference(declaration.$ref);
  const resolved = await registry.resolve(reference, context);
  if (resolved.reference.id !== reference.id
    || (reference.version !== undefined && resolved.reference.version !== reference.version)) {
    throw new Error(`Blueprint host registry returned a mismatched definition for '${declaration.$ref}'`);
  }
  return resolved;
}

export function resolveHostedBlueprintArtifact<TNative = unknown>(
  ref: string,
  registry: BlueprintHostRegistry<TNative> | undefined,
  context: HostedBlueprintResolutionContext,
): BlueprintArtifact {
  if (!registry) throw new Error(`No Blueprint host registry can resolve '${ref}'`);
  return registry.resolveArtifact(parseBlueprintReference(ref), context);
}

function inlineHostedBlueprint<TNative>(blueprint: BlueprintArtifact): HostedBlueprintDefinition<TNative> {
  return {
    reference: {
      scheme: "blueprint",
      id: blueprint.payload.id,
      version: blueprint.payload.version,
    },
    blueprint,
  };
}