import { parseBlueprintJson, type BlueprintArtifact } from "@gik/blueprint";

export const localBlueprintArtifactStorageKey = "gik.manage-blueprints.blueprints.v1";

export interface LocalBlueprintArtifactReadResult {
  blueprints: Record<string, BlueprintArtifact>;
  errors: string[];
}

export interface LocalBlueprintArtifactStore {
  read(): LocalBlueprintArtifactReadResult;
  write(blueprints: Record<string, BlueprintArtifact>): void;
  get(id: string): BlueprintArtifact | undefined;
}

export function createLocalBlueprintArtifactStore(storage?: Storage | null): LocalBlueprintArtifactStore {
  const resolveStorage = () => storage === undefined ? browserStorage() : storage;
  return {
    read() {
      const target = resolveStorage();
      if (!target) return { blueprints: {}, errors: [] };
      const raw = target.getItem(localBlueprintArtifactStorageKey);
      if (!raw) return { blueprints: {}, errors: [] };
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed)) throw new Error("stored value must be an object keyed by blueprint id");
        const blueprints: Record<string, BlueprintArtifact> = {};
        const errors: string[] = [];
        for (const [id, value] of Object.entries(parsed)) {
          try {
            blueprints[id] = parseBlueprintJson(JSON.stringify(value));
          } catch (error) {
            errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        return { blueprints, errors };
      } catch (error) {
        return { blueprints: {}, errors: [error instanceof Error ? error.message : String(error)] };
      }
    },
    write(blueprints) {
      const target = resolveStorage();
      if (!target) throw new Error("Browser localStorage is unavailable in this host.");
      target.setItem(localBlueprintArtifactStorageKey, JSON.stringify(blueprints));
    },
    get(id) {
      return this.read().blueprints[id];
    },
  };
}

function browserStorage(): Storage | null {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return null;
  return globalThis.localStorage ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}