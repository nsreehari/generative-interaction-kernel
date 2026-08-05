import assert from "node:assert/strict";
import { test } from "vitest";
import { createBlueprint } from "@gik/blueprint";
import { createLocalBlueprintArtifactStore } from "../shared/local-blueprint-artifact-store";
import { createSampleBlueprintHostRegistry } from "../shared/hosted-blueprint-registry";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const context = {
  parentBlueprintId: "shell",
  parentInstanceId: "shell:case-7",
  cellId: "analysis-slot",
};

function localBlueprint(id: string, version = "1.0.0") {
  return createBlueprint({
    id,
    kind: "runtime-blueprint",
    version,
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime: { version: "test/1", capabilities: {} },
  });
}

test("resolves browser-local JSON-only Blueprints without native authority", async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  createLocalBlueprintArtifactStore(storage).write({ "local-analysis": localBlueprint("local-analysis") });

  const resolved = await createSampleBlueprintHostRegistry().resolve(
    { scheme: "blueprint", id: "local-analysis" },
    context,
  );

  assert.equal(resolved.blueprint.payload.id, "local-analysis");
  assert.equal(resolved.reference.version, "1.0.0");
  assert.equal(resolved.native, undefined);
});

test("rejects unavailable pinned versions", () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  assert.throws(
    () => createSampleBlueprintHostRegistry().resolve(
      { scheme: "blueprint", id: "samples-overview", version: "999.0.0" },
      context,
    ),
    /version '999.0.0' is unavailable/,
  );
});

test("repository registrations are authoritative and receive child lifecycle identity", async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  createLocalBlueprintArtifactStore(storage).write({
    "samples-overview": localBlueprint("samples-overview", "999.0.0"),
  });
  let received: unknown;
  const registry = createSampleBlueprintHostRegistry({
    createProposalStore(blueprintId, childContext) {
      received = { blueprintId, childContext };
      return {} as never;
    },
  });

  const resolved = await registry.resolve({ scheme: "blueprint", id: "samples-overview" }, context);
  assert.notEqual(resolved.blueprint.payload.version, "999.0.0");
  assert.ok(resolved.native);
  assert.deepEqual(received, { blueprintId: "samples-overview", childContext: context });
});