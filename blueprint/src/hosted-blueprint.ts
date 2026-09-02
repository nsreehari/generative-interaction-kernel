import { parseBlueprintReference } from "./blueprint-reference";
import type {
  BlueprintArtifact,
  BlueprintHostRegistry,
  CellBlueprint,
  HostedBlueprintDefinition,
  HostedBlueprintResolutionContext,
} from "./types";
import type { Json } from "gik-kernel";

export const BLUEPRINT_CAPABILITY = "gik:blueprint";
export const PRESENTATION_FRAGMENT_CAPABILITY = "gik:presentation-fragment";

export function readHostedBlueprintDeclaration(value: Json | undefined): CellBlueprint | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  if (value.gik === "0.1" && value.type === "blueprint" && value.payload
    && typeof value.payload === "object" && !Array.isArray(value.payload)) {
    return { inline: value as unknown as BlueprintArtifact };
  }
  if (typeof value.$ref === "string" && value.inline === undefined) {
    return { $ref: value.$ref };
  }
  if (value.$ref === undefined && value.inline && typeof value.inline === "object" && !Array.isArray(value.inline)) {
    return { inline: value.inline as unknown as BlueprintArtifact };
  }
  return undefined;
}

export function readBlueprintNodeDeclaration(
  props: Readonly<Record<string, Json>>,
): CellBlueprint | undefined {
  return readHostedBlueprintDeclaration(props.blueprint ?? props.hostedBlueprint);
}

export async function resolveHostedBlueprint<TNative = unknown>(
  declaration: CellBlueprint,
  registry: BlueprintHostRegistry<TNative> | undefined,
  context: HostedBlueprintResolutionContext,
): Promise<HostedBlueprintDefinition<TNative>> {
  if (declaration.inline) {
    return inlineHostedBlueprint<TNative>(declaration.inline);
  }
  if (!registry) {
    throw new Error(`No Blueprint host registry can resolve '${declaration.$ref}'`);
  }

  if (typeof declaration.$ref !== "string") {
    throw new Error("Hosted Blueprint reference binding was not resolved before runtime mounting");
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