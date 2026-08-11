import { describe, expect, it } from "vitest";
import {
  analyzeCellComposition,
  materializeBlueprint,
  parseBlueprintReference,
  runMaterializedTransition,
  validateBlueprintArtifact,
  type BlueprintArtifact,
  type CellDefinition,
  type ExternalContext,
} from "@gik/blueprint";
import { openBlueprint } from "@gik/controlface/blueprint";
import type { GIKEvent } from "@gik/kernel";
import { resolveSampleBlueprintSource } from "../catalog/blueprint-catalog";
import { resolveSampleNativeServices } from "../apps/node-host/native-services";
import { createNodeBlueprintServiceHost, nodeServiceOrchestrator } from "../apps/node-host/service-host";

type Assertion =
  | { kind: "valid-artifact" | "composition-valid" }
  | { kind: "equals"; pointer: string; value: unknown }
  | { kind: "placement-children"; parent: string; value: string[] };
type Materialization = { name: string; externalContext: ExternalContext; assertions: Assertion[] };
type RuntimeAssertion = { kind: "state-equals"; pointer: string; value: unknown };
type Scenario = {
  name: string;
  externalContext?: ExternalContext;
  events: GIKEvent[];
  assertions: RuntimeAssertion[];
};
type BlueprintCase = {
  format: "gik-blueprint-test/1";
  name: string;
  blueprintId: string;
  assertions: Assertion[];
  materializations?: Materialization[];
  scenarios?: Scenario[];
};

const modules = import.meta.glob<BlueprintCase>("../blueprints/*/*.case.json", {
  eager: true,
  import: "default",
});

for (const [path, testCase] of Object.entries(modules)) {
  describe(`${testCase.name} (${path.split("/").at(-1)})`, () => {
    const source = resolveSampleBlueprintSource(testCase.blueprintId);
    for (const [index, assertion] of testCase.assertions.entries()) {
      it(`source assertion ${index + 1}: ${assertion.kind}`, () => runAssertion(source, assertion));
    }
    for (const materialization of testCase.materializations ?? []) {
      it(`materializes ${materialization.name}`, () => {
        const terminal = materializeBlueprint({
          blueprint: source,
          externalContext: materialization.externalContext,
          resolveBlueprint(reference) {
            return resolveSampleBlueprintSource(parseBlueprintReference(reference).id);
          },
        }).payload.terminalBlueprint;
        expect(terminal.payload.tiers).toEqual([{ id: "runtime-document", kind: "runtime-document" }]);
        expect(terminal.payload.recipes).toEqual([]);
        for (const assertion of materialization.assertions) runAssertion(terminal, assertion);
      });
    }
    for (const scenario of testCase.scenarios ?? []) {
      it(`runs ${scenario.name}`, async () => {
        const materialized = materializeBlueprint({
          blueprint: source,
          externalContext: scenario.externalContext,
          resolveBlueprint(reference) {
            return resolveSampleBlueprintSource(parseBlueprintReference(reference).id);
          },
        });
        const runtime = openBlueprint(materialized.payload.terminalBlueprint);
        const nativeServices = resolveSampleNativeServices(testCase.blueprintId);
        const result = await runMaterializedTransition({
          materializedBlueprint: materialized,
          state: materialized.payload.initialState,
          events: scenario.events,
          createOrchestrator: (state) => {
            const host = createNodeBlueprintServiceHost(runtime, state, {}, nativeServices);
            return nodeServiceOrchestrator(runtime, host)(undefined, state);
          },
        });
        for (const assertion of scenario.assertions) {
          expect(readPointer(result.state, assertion.pointer)).toEqual(assertion.value);
        }
      });
    }
  });
}

function runAssertion(artifact: BlueprintArtifact, assertion: Assertion): void {
  if (assertion.kind === "valid-artifact") {
    expect(() => validateBlueprintArtifact(artifact)).not.toThrow();
    return;
  }
  if (assertion.kind === "composition-valid") {
    const cells = Object.values(artifact.payload.cells ?? {}) as CellDefinition[];
    expect(analyzeCellComposition(cells)).toMatchObject({ externalInputs: [], diagnostics: [] });
    return;
  }
  if (assertion.kind === "equals") {
    expect(readPointer(artifact, assertion.pointer)).toEqual(assertion.value);
    return;
  }
  const placements = artifact.payload.projections?.presentation?.placements ?? [];
  expect(placements.filter(({ parent }) => parent === assertion.parent).map(({ cell }) => cell)).toEqual(assertion.value);
}

function readPointer(value: unknown, pointer: string): unknown {
  return pointer.slice(1).split("/").reduce((current, encoded) => {
    const key = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    return (current as Record<string, unknown>)[key];
  }, value);
}