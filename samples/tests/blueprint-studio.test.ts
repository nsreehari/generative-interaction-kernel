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

describe("Blueprint Studio", () => {
  it("declares read and draft authoring Cells with current and draft previews", () => {
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
    expect(individual?.outputs).toEqual([
      expect.objectContaining({
        token: "selectedBlueprintRef",
        from: "computed.studio.selectedBlueprintRef",
      }),
    ]);
    expect(runtime.definition.payload.cells?.["blueprint-preview-content"]?.inputs).toEqual([
      {
        token: "selectedBlueprintRef",
        as: "blueprintRef",
        required: true,
      },
    ]);
    expect(tabView).toEqual(expect.objectContaining({
      capability: "fluent:tab-bar",
      props: expect.objectContaining({
        tabs: [
          { value: "overview", headerLabel: "Overview" },
          { value: "form", headerLabel: "Current" },
          { value: "draft", headerLabel: "Draft" },
          { value: "preview", headerLabel: "Preview" },
          { value: "preview-draft", headerLabel: "Preview Draft" },
        ],
      }),
    }));
    expect(representation?.views?.["individual-blueprint"]).toEqual(
      expect.objectContaining({ capability: "primitive:container" }),
    );
    expect(representation?.views?.["blueprint-list-region"]).toEqual(
      expect.objectContaining({ capability: "primitive:container" }),
    );
    expect(representation?.presentation?.composition).toEqual({
      "studio-root": {
        slots: {
          catalog: ["blueprint-list-region"],
          workspace: ["individual-blueprint"],
        },
      },
      "blueprint-list-region": {
        slots: {
          create: ["blueprint-new-form"],
          catalog: ["blueprint-list"],
        },
      },
      "individual-blueprint": {
        slots: {
          actions: ["blueprint-actions"],
          content: ["individual-blueprint-tabs"],
        },
      },
      "blueprint-actions": {
        slots: {
          children: ["blueprint-edit-action", "blueprint-promote-draft-action", "blueprint-delete-draft-action", "blueprint-delete-action"],
        },
      },
      "individual-blueprint-tabs": {
        slots: {
          children: ["blueprint-overview-pane", "blueprint-form-pane", "blueprint-draft-form-pane", "blueprint-preview-pane", "blueprint-draft-preview-pane"],
        },
      },
      "blueprint-preview-pane": {
        slots: {
          context: ["blueprint-preview-context-form"],
          content: ["blueprint-preview-content"],
        },
      },
      "blueprint-draft-preview-pane": {
        slots: {
          context: ["blueprint-draft-preview-context-form"],
          content: ["blueprint-draft-preview-content"],
        },
      },
    });
    expect(representation?.views?.["blueprint-draft-form-pane"]).toMatchObject({
      capability: "primitive:form",
      props: {
        fields: {
          validators: [
            expect.objectContaining({ kind: "blueprint" }),
          ],
        },
      },
    });
    expect(source.payload.cells?.["blueprint-edit-action"]?.behavior?.on?.press)
      .toEqual([expect.objectContaining({ do: "invoke", control: { tool: "createDraft" } })]);
    expect(source.payload.cells?.["blueprint-draft-form-pane"]?.behavior?.on?.save)
      .toEqual([expect.objectContaining({ do: "invoke", control: { tool: "saveDraft" } })]);
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
          selectedBlueprintRef: "blueprint:portfolio-tracker-new@1.0.0",
        });
        const tree = await host.controlface.getTree();
        expect(findNode(tree, "individual-blueprint-tabs")).toMatchObject({
          capability: "fluent:tab-bar",
          visible: true,
        });
        expect(host.controlface.getState().studio.previewExternalContext).toEqual({
          "market-prices": "mock",
          view: "desktop",
          "intelligence-model": "simple",
          ai: "foundry",
          semantic: "simple-markdown",
        });
        expect(host.controlface.getState().studio.previewContextFormSpec).toMatchObject({
          fields: {
            properties: {
              "market-prices": { enum: ["mock", "live"] },
              view: { enum: ["desktop", "mobile"] },
              "intelligence-model": { enum: ["simple", "mock", "semantic"] },
              ai: { enum: ["foundry", "copilot"] },
              semantic: { enum: ["simple-markdown", "rich-components"] },
            },
          },
          saveLabel: "Apply context",
          discardLabel: "Discard",
        });
      });
      expect([...host.hostedControlFaces().values()]).toHaveLength(0);

      await host.controlface.emit({
        node: "blueprint-preview-context-form",
        name: "save",
        payload: {
          values: {
            "intelligence-model": "semantic",
            "market-prices": "mock",
            view: "mobile",
          },
        },
      });
      expect(host.controlface.getState().studio).toMatchObject({
        previewExternalContext: {
          "intelligence-model": "semantic",
          "market-prices": "mock",
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
          "market-prices": "mock",
          view: "mobile",
          ai: "foundry",
          semantic: "simple-markdown",
        });
        expect(Object.keys(
          (children[0]?.getState().portfolio as { stockQuotes: Record<string, unknown> }).stockQuotes,
        ).sort()).toEqual(["AAPL", "MSFT"]);
      });

      await host.controlface.emit({
        node: "blueprint-edit-action",
        name: "press",
        payload: {},
      });
      await host.controlface.whenIdle();
      await eventually(() => {
        expect(host.controlface.getState().studio).toMatchObject({
          selectedBlueprintId: "portfolio-tracker-new",
          selected: {
            id: "portfolio-tracker-new",
            draft: {
              id: "portfolio-tracker-new.draft",
              ref: "blueprint:portfolio-tracker-new.draft@1.0.0",
              artifact: {
                payload: { id: "portfolio-tracker-new.draft" },
              },
            },
          },
          activeTab: "draft",
        });
      });

      await host.controlface.emit({
        node: "individual-blueprint-tabs",
        name: "select",
        payload: { value: "preview-draft" },
      });
      await host.controlface.whenIdle();
      await eventually(() => {
        const children = [...host.hostedControlFaces().values()];
        expect(children).toHaveLength(1);
        expect(children[0]?.getBlueprint()?.payload.id).toBe("portfolio-tracker-new.draft");
        expect(children[0]?.getState().externalContext).toMatchObject({
          "market-prices": "mock",
          view: "desktop",
          "intelligence-model": "simple",
        });
      });
    } finally {
      await host.stop();
    }
  });
});
