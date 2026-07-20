import { ControlFace, type BlueprintDefinition, type BlueprintRuntime } from "@gik/controlface";
import type { DocumentPayload } from "@gik/kernel";
import { loadProfile, type LayerRecipe, type ProfileArtifact } from "@gik/profile";

const modules = import.meta.glob("../profiles/*/compile.ts", { eager: true }) as Record<string, {
  blueprint?: BlueprintDefinition["profile"];
  lowerBlueprint?: BlueprintDefinition["lower"];
}>;
const profileArtifacts = import.meta.glob("../profiles/*/profile.json", {
  eager: true,
  import: "default",
}) as Record<string, ProfileArtifact>;

const definitions = new Map<string, BlueprintDefinition>();
for (const [path, module] of Object.entries(modules)) {
  const id = path.match(/\/profiles\/([^/]+)\//)?.[1];
  if (id && module.blueprint && module.lowerBlueprint) {
    definitions.set(id, { profile: module.blueprint, lower: module.lowerBlueprint });
  }
}
for (const [path, artifact] of Object.entries(profileArtifacts)) {
  const id = path.match(/\/profiles\/([^/]+)\//)?.[1];
  if (!id || definitions.has(id)) continue;
  const document = artifact.payload.resources?.document;
  if (!document || !("inline" in document)) continue;
  const profile = loadProfile<LayerRecipe>(artifact, []);
  definitions.set(id, {
    profile,
    lower: () => structuredClone(document.inline) as unknown as DocumentPayload,
  });
}

const resolver = { resolve: (id: string) => definitions.get(id) };

export function hasSampleBlueprint(id: string): boolean {
  return definitions.has(id);
}

export function openSampleBlueprint(id: string): BlueprintRuntime {
  return ControlFace.openBlueprint(resolver, { blueprintId: id });
}