import assert from "node:assert/strict";
import { test } from "vitest";
import { createBlueprint } from "@gik/blueprint";
import {
  readHostedBlueprintDeclaration,
  resolveHostedBlueprint,
  type ReactBlueprintHostRegistry,
} from "../src/primitives/hosted-blueprint";
import { assertBlueprintHostProjection } from "../src/primitives/blueprint-host";

const child = createBlueprint({
  id: "analysis",
  kind: "runtime-blueprint",
  version: "1.0.0",
  tiers: [{ id: "runtime", kind: "runtime-program" }],
  recipes: [],
  runtime: { version: "test/1", capabilities: {} },
});

const context = {
  parentBlueprintId: "shell",
  parentInstanceId: "shell:case-7",
  cellId: "analysis-slot",
};

test("resolves a canonical child reference with parent instance context", async () => {
  let receivedContext: typeof context | undefined;
  const registry: ReactBlueprintHostRegistry = {
    resolveArtifact: () => child,
    resolve(reference, nextContext) {
      receivedContext = nextContext;
      return { reference: { ...reference, version: reference.version ?? "1.0.0" }, blueprint: child };
    },
  };

  const resolved = await resolveHostedBlueprint({ $ref: "blueprint:analysis" }, registry, context);
  assert.equal(resolved.blueprint, child);
  assert.deepEqual(receivedContext, context);
});

test("fails closed when a registry resolves a different Blueprint", async () => {
  const registry: ReactBlueprintHostRegistry = {
    resolveArtifact: () => child,
    resolve() {
      return { reference: { scheme: "blueprint", id: "other", version: "1.0.0" }, blueprint: child };
    },
  };

  await assert.rejects(
    resolveHostedBlueprint({ $ref: "blueprint:analysis@1.0.0" }, registry, context),
    /mismatched definition/,
  );
});

test("mounts inline child artifacts without a host registry", async () => {
  const resolved = await resolveHostedBlueprint({ inline: child }, undefined, context);
  assert.deepEqual(resolved.reference, { scheme: "blueprint", id: "analysis", version: "1.0.0" });
  assert.equal(resolved.blueprint, child);
});

test("rejects malformed child declarations from render-node JSON", () => {
  assert.equal(readHostedBlueprintDeclaration({ $ref: "blueprint:analysis", inline: {} }), undefined);
  assert.equal(readHostedBlueprintDeclaration({ $ref: 7 }), undefined);
  assert.deepEqual(readHostedBlueprintDeclaration({ $ref: "blueprint:analysis" }), {
    $ref: "blueprint:analysis",
  });
});

test("rendering hosts reject a projection-free Blueprint with a targeted diagnostic", () => {
  assert.throws(
    () => assertBlueprintHostProjection("BlueprintHost", "headless", {
      gik: "0.1",
      type: "program",
      payload: { handlers: [] },
    }),
    /BlueprintHost cannot render Blueprint 'headless' without a presentation projection/,
  );
});