import {
  parseBlueprintReference,
  type BlueprintArtifact,
  type BlueprintHostRegistry,
  type CellBlueprint,
  type HostedBlueprintDefinition,
  type HostedBlueprintResolutionContext,
} from "@gik/blueprint";
import type { BundleNative } from "./bundle";
import type { Json } from "@gik/kernel";
import React from "react";

export const BLUEPRINT_HOST_PROVIDER = "blueprint-host";
export const HOSTED_BLUEPRINT_CAPABILITY = "hosted-blueprint";

export type ReactBlueprintHostRegistry = BlueprintHostRegistry<BundleNative>;

const BlueprintHostRegistryContext = React.createContext<ReactBlueprintHostRegistry | undefined>(undefined);

export function BlueprintHostRegistryProvider({
  registry,
  children,
}: {
  registry?: ReactBlueprintHostRegistry;
  children: React.ReactNode;
}): React.ReactElement {
  return React.createElement(BlueprintHostRegistryContext.Provider, { value: registry }, children);
}

export function useBlueprintHostRegistry(): ReactBlueprintHostRegistry | undefined {
  return React.useContext(BlueprintHostRegistryContext);
}

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

export async function resolveHostedBlueprint(
  declaration: CellBlueprint,
  registry: ReactBlueprintHostRegistry | undefined,
  context: HostedBlueprintResolutionContext,
): Promise<HostedBlueprintDefinition<BundleNative>> {
  if (declaration.inline) {
    const inline = inlineHostedBlueprint(declaration.inline);
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

function inlineHostedBlueprint(blueprint: BlueprintArtifact): HostedBlueprintDefinition<BundleNative> {
  return {
    reference: {
      scheme: "blueprint",
      id: blueprint.payload.id,
      version: blueprint.payload.version,
    },
    blueprint,
  };
}

export function resolveHostedBlueprintArtifact(
  ref: string,
  registry: ReactBlueprintHostRegistry | undefined,
  context: HostedBlueprintResolutionContext,
): BlueprintArtifact {
  if (!registry) throw new Error(`No Blueprint host registry can resolve '${ref}'`);
  return registry.resolveArtifact(parseBlueprintReference(ref), context);
}