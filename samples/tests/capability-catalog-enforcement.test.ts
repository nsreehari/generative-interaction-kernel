// review-r1: production hosts previously never supplied a real capabilityCatalog to
// materializeBlueprint, so every capability silently got the permissive fallback descriptor and
// terminal validation never enforced actual component prop/event contracts. This proves the fix
// end to end using the exact resolution pattern samples/apps/browser-host/src/runtime/
// provider-registry.ts wires into production (buildCapabilityCatalogFromExternals against a real
// @gik/components descriptor provider), not a hand-rolled substitute.

import assert from "node:assert/strict";
import { buildCapabilityCatalogFromExternals } from "@gik/react";
import { materializeBlueprint, createBlueprint, type BlueprintArtifact } from "@gik/blueprint";
import { Kernel, ValidationError, type CapabilityDescriptor } from "@gik/kernel";
import { fluentComponentCapabilities } from "@gik/components/fluent";
import { test } from "vitest";

// fluent:text's real schema requires `value` and forbids unknown props (additionalProperties: false).
function blueprintWithInvalidTextProps(): BlueprintArtifact {
  return createBlueprint({
    id: "capability-catalog-enforcement",
    kind: "runtime-blueprint",
    version: "1.0.0",
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime: {
      externals: { projectionViews: { fluent: { from: "fluent", use: ["text"] } } },
      state: {},
    },
    cells: {
      label: {
        id: "label",
        potentialViews: {
          // "value" (required by the real schema) is missing, and "bogus" is not a declared prop.
          primary: { capability: "fluent:text", props: { bogus: true }, region: "root" },
        },
      },
    },
    presentation: { slots: ["root"], root: "root" },
  });
}

function resolveFluentDescriptors(from: string): Record<string, CapabilityDescriptor> | undefined {
  return from === "fluent" ? fluentComponentCapabilities : undefined;
}

test("without a capabilityCatalog, an invalid fluent:text prop passes the permissive fallback descriptor", () => {
  const materialized = materializeBlueprint({ blueprint: blueprintWithInvalidTextProps() });
  assert.doesNotThrow(() => new Kernel(materialized.payload.vocabulary, materialized.payload.program));
});

test("with a real capabilityCatalog (the production browser-host resolution pattern), the same invalid prop is rejected", () => {
  const blueprint = blueprintWithInvalidTextProps();
  const capabilityCatalog = buildCapabilityCatalogFromExternals(blueprint.payload.runtime.externals, resolveFluentDescriptors);
  assert.deepEqual(Object.keys(capabilityCatalog), ["fluent:text"]);

  const materialized = materializeBlueprint({ blueprint, capabilityCatalog });
  assert.throws(() => new Kernel(materialized.payload.vocabulary, materialized.payload.program), ValidationError);
});

test("with the real catalog, a well-formed fluent:text prop still passes", () => {
  const blueprint = createBlueprint({
    ...blueprintWithInvalidTextProps().payload,
    cells: {
      label: {
        id: "label",
        potentialViews: {
          primary: { capability: "fluent:text", props: { value: "Blueprint Studio" }, region: "root" },
        },
      },
    },
  });
  const capabilityCatalog = buildCapabilityCatalogFromExternals(blueprint.payload.runtime.externals, resolveFluentDescriptors);
  const materialized = materializeBlueprint({ blueprint, capabilityCatalog });
  assert.doesNotThrow(() => new Kernel(materialized.payload.vocabulary, materialized.payload.program));
});
