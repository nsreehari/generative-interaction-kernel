import { describe, expect, it } from "vitest";
import type { ResolvedNode } from "@gik/kernel";

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

function findNode(node: ResolvedNode | undefined, id: string): ResolvedNode | undefined {
  if (!node) return undefined;
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

describe("Blueprint Studio read shell", () => {
  it("declares list/read Cell ports and three projection-tier tabs", () => {
    const source = resolveSampleBlueprintSource("blueprint-studio");
    const runtime = openSampleBlueprint("blueprint-studio");
    const list = source.payload.cells?.["blueprint-list"];
    const individual = source.payload.cells?.["individual-blueprint"];
    const tabView = runtime.definition.payload.cells?.["individual-blueprint-tabs"]?.view;
    const representation = source.payload.recipes?.[0]?.representations?.[0];

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
    expect(tabView).toEqual(expect.objectContaining({
      capability: "fluent:tab-bar",
      props: expect.objectContaining({
        tabs: [
          { value: "overview", headerLabel: "Overview" },
          { value: "form", headerLabel: "Form" },
          { value: "preview", headerLabel: "Preview" },
        ],
      }),
    }));
    expect(representation?.views?.["individual-blueprint"]).toEqual(
      expect.objectContaining({ capability: "primitive:container" }),
    );
    expect(representation?.views?.["blueprint-list-region"]).toEqual(
      expect.objectContaining({ capability: "primitive:container" }),
    );
    expect(representation?.presentation?.placements).toEqual(expect.arrayContaining([
      { cell: "blueprint-list-region", parent: "studio-root", slot: "children", order: 0 },
      { cell: "individual-blueprint", parent: "studio-root", slot: "children", order: 1 },
      { cell: "blueprint-list", parent: "blueprint-list-region", slot: "children", order: 0 },
      { cell: "individual-blueprint-tabs", parent: "individual-blueprint", slot: "children", order: 0 },
      { cell: "blueprint-overview-pane", parent: "individual-blueprint-tabs", slot: "panes", order: 0 },
      { cell: "blueprint-form-pane", parent: "individual-blueprint-tabs", slot: "panes", order: 1 },
      { cell: "blueprint-preview-pane", parent: "individual-blueprint-tabs", slot: "panes", order: 2 },
      { cell: "blueprint-preview-context-form", parent: "blueprint-preview-pane", slot: "children", order: 0 },
      { cell: "blueprint-preview-content", parent: "blueprint-preview-pane", slot: "children", order: 1 },
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
      await eventually(async () => {
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
      await eventually(async () => {
        expect(host.controlface.getState().studio).toMatchObject({
          selectedBlueprintId: "portfolio-tracker-new",
          selected: {
            id: "portfolio-tracker-new",
            source: "repo",
            readonly: true,
          },
          previewExternalContext: {
            "intelligence-model": "simple",
            "market-prices": "mock",
            view: "desktop",
          },
        });
        const tree = await host.controlface.getTree();
        expect(findNode(tree, "individual-blueprint-tabs")).toMatchObject({
          capability: "fluent:tab-bar",
          visible: true,
        });
      });
      expect([...host.hostedControlFaces().values()]).toHaveLength(0);

      await host.controlface.emit({
        node: "blueprint-preview-context-form",
        name: "save",
        payload: {
          values: {
            "intelligence-model": "semantic",
            "market-prices": "live",
            view: "mobile",
          },
        },
      });
      expect(host.controlface.getState().studio).toMatchObject({
        previewExternalContext: {
          "intelligence-model": "semantic",
          "market-prices": "live",
          view: "mobile",
        },
      });

      await host.controlface.emit({
        node: "individual-blueprint-tabs",
        name: "select",
        payload: { value: "preview" },
      });
      await host.controlface.whenIdle();
      await eventually(() => {
        const children = [...host.hostedControlFaces().values()];
        expect(children).toHaveLength(1);
        expect(children[0]?.getBlueprint()?.payload.id).toBe("portfolio-tracker-new");
        expect(children[0]?.getState().externalContext).toEqual({
          "intelligence-model": "semantic",
          "market-prices": "live",
          view: "mobile",
        });
      });
    } finally {
      await host.stop();
    }
  });
});
