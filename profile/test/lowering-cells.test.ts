import { describe, expect, it } from "vitest";
import { defineLoweringCell } from "../src/lowering-cells";

describe("lowering cells", () => {
  it("defines a strategy-driven artifact transform independently of runtime Cells", () => {
    const cell = defineLoweringCell({
      id: "lower-presentation",
      kind: "transform",
      fromLayer: "presentation",
      toLayer: "runtime-document",
      inputs: [{ token: "presentation", artifactType: "presentation-spec", required: true }],
      outputs: [{ token: "program", artifactType: "executable-program" }],
      strategy: { id: "standard-presentation", version: "1", executor: "lower-document" },
      policy: { deterministic: true, requiresValidation: true },
    });

    expect(cell.strategy?.executor).toBe("lower-document");
    expect(cell.outputs?.[0].artifactType).toBe("executable-program");
  });

  it("requires terminal Blueprint emission to cross validation", () => {
    expect(() => defineLoweringCell({
      id: "emit",
      kind: "emit-blueprint",
      inputs: [{ token: "candidate", artifactType: "executable-program" }],
      outputs: [{ token: "blueprint", artifactType: "executable-blueprint" }],
    })).toThrow("must require validation");
  });

  it("rejects duplicate artifact ports", () => {
    expect(() => defineLoweringCell({
      id: "candidates",
      kind: "select-strategy",
      outputs: [
        { token: "selected", artifactType: "lowering-strategy" },
        { token: "selected", artifactType: "lowering-strategy" },
      ],
    })).toThrow("duplicate output token 'selected'");
  });
});