import {
  ControlFace,
  defineDeclarativeBlueprint,
  type BlueprintDefinition,
  type BlueprintRuntime,
} from "@gik/controlface";
import type { ProfileArtifact } from "@gik/profile";

const modules = import.meta.glob("../compilers/*/index.ts", { eager: true }) as Record<string, {
  blueprint?: BlueprintDefinition["profile"];
  lowerBlueprint?: BlueprintDefinition["lower"];
}>;
const profileArtifacts = import.meta.glob("../profiles/*/profile.json", {
  eager: true,
  import: "default",
}) as Record<string, ProfileArtifact>;

const definitions = new Map<string, BlueprintDefinition>();
for (const [path, module] of Object.entries(modules)) {
  const id = path.match(/\/compilers\/([^/]+)\//)?.[1];
  if (id && module.blueprint && module.lowerBlueprint) {
    definitions.set(id, { profile: module.blueprint, lower: module.lowerBlueprint });
  }
}
for (const [path, artifact] of Object.entries(profileArtifacts)) {
  const id = path.match(/\/profiles\/([^/]+)\//)?.[1];
  if (!id || definitions.has(id)) continue;
  const definition = defineDeclarativeBlueprint(artifact);
  if (definition) definitions.set(id, definition);
}

const resolver = { resolve: (id: string) => definitions.get(id) };

export function hasSampleBlueprint(id: string): boolean {
  return definitions.has(id);
}

export function openSampleBlueprint(id: string): BlueprintRuntime {
  return ControlFace.openBlueprint(resolver, { blueprintId: id });
}