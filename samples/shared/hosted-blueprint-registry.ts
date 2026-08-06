import type { HostedBlueprintResolutionContext } from "@gik/blueprint";
import type { BlueprintProposalStore } from "@gik/blueprint-agent-host";
import type { ReactBlueprintHostRegistry } from "@gik/react";
import type { UseProposal } from "./blueprint-agent-lifecycle";
import { applyHostConfig } from "./host-config";
import { resolveBlueprintNative } from "./sample-bundles";
import { getSampleBlueprintCatalog, sampleBlueprints } from "./blueprints";

export interface SampleBlueprintHostRegistryOptions {
  createProposalStore?: (
    blueprintId: string,
    context: HostedBlueprintResolutionContext,
  ) => BlueprintProposalStore<UseProposal>;
}

export function createSampleBlueprintHostRegistry(
  options: SampleBlueprintHostRegistryOptions = {},
): ReactBlueprintHostRegistry {
  const resolveArtifact = (reference: Parameters<ReactBlueprintHostRegistry["resolveArtifact"]>[0]) => {
    const repositoryBlueprint = getSampleBlueprintCatalog().seedEntries[reference.id];
    const blueprint = repositoryBlueprint ?? sampleBlueprints[reference.id];
    if (!blueprint) throw new Error(`Unknown hosted Blueprint '${reference.id}'`);
    if (reference.version !== undefined && blueprint.payload.version !== reference.version) {
      throw new Error(
        `Hosted Blueprint '${reference.id}' version '${reference.version}' is unavailable; host has '${blueprint.payload.version}'`,
      );
    }
    return applyHostConfig(blueprint);
  };
  return {
    resolveArtifact,
    resolve(reference, context) {
      const repositoryBlueprint = getSampleBlueprintCatalog().seedEntries[reference.id];
      const blueprint = resolveArtifact(reference);

      const proposalStore = options.createProposalStore?.(reference.id, context);
      return {
        reference: {
          scheme: "blueprint",
          id: reference.id,
          version: blueprint.payload.version,
        },
        blueprint,
        ...(repositoryBlueprint
          ? { native: resolveBlueprintNative(reference.id, { proposalStore }) }
          : {}),
      };
    },
  };
}