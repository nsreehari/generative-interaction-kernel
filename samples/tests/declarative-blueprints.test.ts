import { describe, expect, it } from "vitest";
import {
  analyzeCellComposition,
  materializeBlueprint,
  parseBlueprintReference,
  validateBlueprintArtifact,
  type BlueprintArtifact,
  type CellDefinition,
  type ExternalContext,
} from "@gik/blueprint";
import { resolveSampleBlueprintSource } from "../catalog/blueprint-catalog";

type Assertion =
  | { kind: "valid-artifact" | "composition-valid" }
  | { kind: "equals"; pointer: string; value: unknown }
  | { kind: "placement-children"; parent: string; value: string[] };
type Materialization = { name: string; externalContext: ExternalContext; assertions: Assertion[] };
type BlueprintCase = {
  format: "gik-blueprint-test/1";
  name: string;
  blueprintId: string;
  assertions: Assertion[];
  materializations?: Materialization[];
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