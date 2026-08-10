import { describe, expect, it } from "vitest";
import { analyzeCellComposition, type CellDefinition } from "@gik/blueprint";
import { unwrap } from "@gik/kernel";

import { openSampleBlueprint, resolveSampleBlueprintSource } from "../shared/blueprint-catalog";

const blueprint = resolveSampleBlueprintSource("incident-report-explorer");
const cells = Object.values(blueprint.payload.cells) as unknown as CellDefinition[];

describe("incident-report-explorer Blueprint", () => {
  it("composes an editable report into a dependent agent analysis", () => {
    expect(cells.map((cell) => cell.id)).toEqual([
      "incident-workspace",
      "incident-report",
      "incident-report-selector",
      "incident-report-markdown",
      "incident-report-form",
      "foundry-access-gate",
      "incident-intelligence",
    ]);
    expect(analyzeCellComposition(cells)).toMatchObject({
      externalInputs: [],
      diagnostics: [],
    });

    const program = unwrap(openSampleBlueprint("incident-report-explorer").program);
    expect(program.root.edges?.children?.map((node) => node.id)).toEqual([
      "incident-report",
      "foundry-access-gate",
    ]);
    expect(program.root.edges?.children?.[0]?.edges?.children?.map((node) => node.id)).toEqual([
      "incident-report-selector",
      "incident-report-markdown",
      "incident-report-form",
    ]);
    expect(program.root.edges?.children?.[1]?.edges?.children?.map((node) => node.id)).toEqual([
      "incident-intelligence",
    ]);
    expect(cells.find((cell) => cell.id === "incident-report")?.outputs).toEqual([{
      token: "incident-report-content",
      from: "incident.content",
      when: "$length(incident.content) > 0",
    }]);
    expect(cells.find((cell) => cell.id === "incident-report-form")?.view).toMatchObject({
      capability: "primitive:form",
      props: {
        fields: { properties: { content: { format: "textarea", rows: 34 } } },
      },
      bindings: { value: { from: "incident.formValue" } },
    });
    const selector = cells.find((cell) => cell.id === "incident-report-selector");
    expect(selector).toMatchObject({
      behavior: { events: { select: [{ do: "invoke", args: { tool: "selectSampleReport" } }] } },
      view: {
        capability: "fluent:dropdown",
        props: { ariaLabel: "Choose sample incident" },
        bindings: { value: { from: "incident.selectedSampleId" } },
      },
    });
    expect((selector?.view?.props as { options?: unknown[] })?.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "blob-storage-exfiltration" }),
      expect.objectContaining({ value: "device-code-bec" }),
    ]));
    expect(cells.find((cell) => cell.id === "incident-intelligence")).toMatchObject({
      inputs: [{ token: "incident-report-content" }],
      sources: [{ service: "incident-report-intelligence", operation: "analyzeReport" }],
      view: {
        bindings: {
          content: { from: "incident.content" },
          analyzedContent: { from: "incident.analyzedContent" },
        },
      },
    });
    expect(cells.find((cell) => cell.id === "foundry-access-gate")).toMatchObject({
      view: {
        capability: "foundry:access-gate",
        bindings: {
          access: {
            expression: expect.stringContaining("'triggered': $s != 'ready' and $s != 'empty'"),
          },
        },
      },
    });
  });

  it("starts with stale-aware analysis state", () => {
    const runtime = openSampleBlueprint("incident-report-explorer");
    expect(runtime.state.incident).toMatchObject({
      selectedSampleId: "password-spray-mailbox",
      content: "# Loading incident report…",
      intelligence: null,
      analyzedContent: null,
      pendingContent: null,
      foundryAccessStatus: "required",
      foundryAccessError: "",
    });
  });
});