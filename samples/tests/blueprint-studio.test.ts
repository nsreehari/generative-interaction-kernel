import { describe, expect, it } from "vitest";

import { createNodeHost } from "../apps/node-host/service";
import {
  openSampleBlueprint,
  resolveSampleBlueprintSource,
} from "../catalog/blueprint-catalog";

async function eventually(assertion: () => void | Promise<void>): Promise<void> {
  const deadline = Date.now() + 5_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw lastError;
}

describe("Blueprint Studio read shell", () => {
  it("declares list/read Cell ports and three projection-tier tabs", () => {
    const source = resolveSampleBlueprintSource("blueprint-studio");
    const runtime = openSampleBlueprint("blueprint-studio");
    const list = source.payload.cells?.["blueprint-list"];
    const individual = source.payload.cells?.["individual-blueprint"];
    const view = runtime.definition.payload.cells?.["individual-blueprint"]?.view;

    expect(list?.inputs).toEqual([
      expect.objectContaining({
        token: "studio.selectedBlueprintId",
        as: "selectedBlueprintId",
      }),
    ]);
    expect(list?.outputs).toEqual([
      expect.objectContaining({
        token: "selectedBlueprintId",
        from: "inputs.selectedBlueprintId",
      }),
    ]);
    expect(individual?.inputs).toEqual([
      expect.objectContaining({
        token: "selectedBlueprintId",
        as: "selectedBlueprintId",
        required: true,
      }),
    ]);
    expect(individual?.sources).toEqual([
      expect.objectContaining({
        service: "blueprint-studio-data",
        operation: "fetchBlueprint",
      }),
    ]);
    expect(view?.before).toEqual(expect.arrayContaining([
      expect.objectContaining({
        capability: "fluent:tab-bar",
        props: expect.objectContaining({
          options: [
            { value: "overview", label: "Overview" },
            { value: "form", label: "Form" },
            { value: "preview", label: "Preview" },
          ],
        }),
      }),
      expect.objectContaining({ capability: "primitive:markdown" }),
      expect.objectContaining({ capability: "primitive:form" }),
      expect.objectContaining({ capability: "gik:blueprint" }),
    ]));
    expect(runtime.definition.payload.runtime?.externals?.effectHandlers ?? []).toEqual([]);
  });

  it("loads bootstrap records, fetches a selection, and hosts its nested preview", async () => {
    const host = await createNodeHost({
      profile: "blueprint-studio",
      environment: {},
      port: 0,
    });
    try {
      await host.controlface.whenIdle();
      await eventually(() => {
        expect(host.controlface.getState().studio).toMatchObject({
          selectedBlueprintId: "",
          selected: null,
        });
        expect((host.controlface.getState().studio as { blueprints: Array<{ id: string }> })
          .blueprints.map(({ id }) => id)).toContain("portfolio-tracker-new");
      });

      await host.controlface.emit({
        node: "blueprint-list",
        name: "select",
        payload: { values: ["portfolio-tracker-new"] },
      });
      await host.controlface.whenIdle();
      await eventually(() => {
        expect(host.controlface.getState().studio).toMatchObject({
          selectedBlueprintId: "portfolio-tracker-new",
          selected: {
            id: "portfolio-tracker-new",
            source: "repo",
            readonly: true,
          },
        });
      });

      await host.controlface.emit({
        node: "individual-blueprint",
        name: "select",
        payload: { value: "preview" },
      });
      await host.controlface.whenIdle();
      await eventually(() => {
        const children = [...host.hostedControlFaces().values()];
        expect(children).toHaveLength(1);
        expect(children[0]?.getBlueprint()?.payload.id).toBe("portfolio-tracker-new");
      });
    } finally {
      await host.stop();
    }
  });
});
