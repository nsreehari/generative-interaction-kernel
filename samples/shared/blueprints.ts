import {
  ControlFace,
  defineDeclarativeBlueprint,
  type BlueprintDefinition,
  type BlueprintRuntime,
} from "@gik/controlface";
import type { ProfileArtifact } from "@gik/profile";
import {
  blueprint as liveWorkspaceSocBlueprint,
  lowerBlueprint as lowerLiveWorkspaceSocBlueprint,
} from "../compilers/live-workspace-soc";

const profileArtifacts = import.meta.glob("../profiles/*/profile.json", {
  eager: true,
  import: "default",
}) as Record<string, ProfileArtifact>;

const definitions = new Map<string, BlueprintDefinition>();
for (const [path, artifact] of Object.entries(profileArtifacts)) {
  const id = path.match(/\/profiles\/([^/]+)\//)?.[1];
  if (!id) continue;
  const definition = defineDeclarativeBlueprint(artifact);
  if (definition) definitions.set(id, definition);
}

// Legacy migration residue: live-workspace-soc still needs explicit lowering until the remaining
// product-specific runtime mutation moves into authored recipe data.
definitions.set("live-workspace-soc", {
  profile: liveWorkspaceSocBlueprint,
  lower: lowerLiveWorkspaceSocBlueprint,
});

const resolver = { resolve: (id: string) => definitions.get(id) };

export function hasSampleBlueprint(id: string): boolean {
  return definitions.has(id);
}

export function openSampleBlueprint(id: string): BlueprintRuntime {
  return ControlFace.openBlueprint(resolver, { blueprintId: id });
}