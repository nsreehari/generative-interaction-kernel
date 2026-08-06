import assert from "node:assert/strict";
import { beforeEach, test } from "vitest";
import { createBlueprint } from "@gik/blueprint";
import { installUserBlueprints } from "../shared/blueprints";
import { createSampleBlueprintHostRegistry } from "../shared/hosted-blueprint-registry";

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

beforeEach(() => installUserBlueprints({}));

test("resolves browser-local JSON-only Blueprints without native authority", async () => {
  installUserBlueprints({ "local-analysis": localBlueprint("local-analysis") });

  const resolved = await createSampleBlueprintHostRegistry().resolve(
    { scheme: "blueprint", id: "local-analysis" },
    context,
  );

  assert.equal(resolved.blueprint.payload.id, "local-analysis");
  assert.equal(resolved.reference.version, "1.0.0");
  assert.equal(resolved.native, undefined);
});

test("rejects unavailable pinned versions", () => {
  assert.throws(
    () => createSampleBlueprintHostRegistry().resolve(
      { scheme: "blueprint", id: "samples-overview", version: "999.0.0" },
      context,
    ),
    /version '999.0.0' is unavailable/,
  );
});

test("repository registrations are authoritative and receive child lifecycle identity", async () => {
  installUserBlueprints({
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