import type { BlueprintReference } from "./types";

const BLUEPRINT_REFERENCE = /^blueprint:([a-z0-9](?:[a-z0-9._/-]*[a-z0-9])?)(?:@([a-z0-9][a-z0-9.+-]*))?$/i;

export function parseBlueprintReference(value: string): BlueprintReference {
  const match = BLUEPRINT_REFERENCE.exec(value);
  if (!match) {
    throw new Error(`Invalid Blueprint reference '${value}'`);
  }

  const [, id, version] = match;
  return {
    scheme: "blueprint",
    id,
    ...(version ? { version } : {}),
  };
}

export function formatBlueprintReference(reference: BlueprintReference): string {
  const value = `blueprint:${reference.id}${reference.version ? `@${reference.version}` : ""}`;
  parseBlueprintReference(value);
  return value;
}