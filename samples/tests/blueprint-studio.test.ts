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
    expect(individual?.outputs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        token: "selectedBlueprintRef",
        from: "computed.studio.selectedBlueprintRef",
      }),
      { token: "blueprintJsonVersion", from: "studio.blueprintJsonVersion" },
      { token: "blueprintPreviewVersion", from: "studio.blueprintPreviewVersion" },
    ]));
    expect(runtime.definition.payload.cells?.["blueprint-preview-content"]?.inputs).toEqual([
      {
        token: "selectedBlueprintRef",
        as: "blueprintRef",
        required: true,
      },
      {
        token: "blueprintPreviewVersion",
        as: "version",
        required: true,
      },
    ]);
    expect(source.payload.cells?.["individual-blueprint"]?.outputs).toEqual(expect.arrayContaining([
      { token: "blueprintJsonVersion", from: "studio.blueprintJsonVersion" },
      { token: "blueprintPreviewVersion", from: "studio.blueprintPreviewVersion" },
    ]));
    expect(tabView).toEqual(expect.objectContaining({
      capability: "fluent:tab-bar",
      props: expect.objectContaining({
        tabs: [
          { value: "overview", headerLabel: "Overview" },
          { value: "blueprint-json", headerLabel: "Blueprint JSON" },
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
    expect(representation?.views?.["blueprint-list"]).toMatchObject({
      capability: "fluent:list",
      props: { variant: "vertical-cards", selectionMode: "single" },
    });
    expect(representation?.views?.["blueprint-new-dialog"]).toMatchObject({
      capability: "primitive:pane-with-trigger",
      props: {
        variant: "dialog-modal",
        title: "Create a Blueprint draft",
        triggerLabel: "New Blueprint",
        triggerAppearance: "primary",
        closeLabel: "Close new Blueprint form",
      },
    });
    expect(representation?.presentation?.composition).toEqual({
      "studio-root": {
        slots: {
          catalog: ["blueprint-list-region"],
          workspace: ["individual-blueprint"],
        },
      },
      "blueprint-list-region": {
        slots: {
          heading: ["blueprint-catalog-title"],
          catalog: ["blueprint-list"],
          create: ["blueprint-new-dialog"],
        },
      },
      "blueprint-new-dialog": {
        slots: {
          content: ["blueprint-new-form"],
        },
      },
      "individual-blueprint": {
        slots: {
          content: ["individual-blueprint-tabs"],
        },
      },
      "blueprint-overview-pane": {
        slots: {
          record: ["blueprint-overview-record"],
        },
      },
      "blueprint-overview-record": {
        slots: {
          summary: ["blueprint-overview-content"],
          lifecycle: ["blueprint-delete-action"],
        },
      },
      "individual-blueprint-tabs": {
        slots: {
          children: ["blueprint-overview-pane", "blueprint-json-pane", "blueprint-preview-pane"],
        },
      },
      "blueprint-json-pane": {
        slots: {
          version: ["blueprint-json-version-switch"],
          definition: ["blueprint-current-definition", "blueprint-draft-definition"],
        },
      },
      "blueprint-current-definition": {
        slots: {
          document: ["blueprint-form-pane"],
          lifecycle: ["blueprint-edit-action"],
        },
      },
      "blueprint-draft-definition": {
        slots: {
          document: ["blueprint-draft-form-pane"],
          lifecycle: ["blueprint-delete-draft-action"],
        },
      },
      "blueprint-preview-pane": {
        slots: {
          version: ["blueprint-preview-version-switch"],
          context: ["blueprint-preview-context"],
          blueprint: ["blueprint-preview-blueprint"],
        },
      },
      "blueprint-preview-context": {
        slots: {
          form: ["blueprint-preview-context-form", "blueprint-draft-preview-context-form"],
        },
      },
      "blueprint-preview-blueprint": {
        slots: {
          lifecycle: ["blueprint-promote-draft-action"],
          content: ["blueprint-preview-content", "blueprint-draft-preview-content"],
        },
      },
    });
    expect(representation?.views?.["blueprint-preview-blueprint"]).toMatchObject({
      capability: "primitive:container",
      props: { ariaLabel: "Previewed Blueprint" },
    });
    expect(representation?.views?.["blueprint-new-form"]?.props?.fields?.properties).toHaveProperty("cloneFrom");
    expect(source.payload.services?.["blueprint-studio-data"]?.operations).toHaveProperty(
      "cloneBlueprintDraft.operation",
      "clone-blueprint-draft",
    );
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
      .toEqual([expect.objectContaining({
        do: "invoke",
        control: expect.objectContaining({ tool: "createDraft", serviceRef: "blueprint-studio-data" }),
      })]);
    expect(source.payload.cells?.["blueprint-draft-form-pane"]?.behavior?.on?.save)
      .toEqual([expect.objectContaining({
        do: "invoke",
        control: expect.objectContaining({ tool: "saveDraft", serviceRef: "blueprint-studio-data" }),
      })]);
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
            readonly: true,
            draft: null,
          },
          activeTab: "preview",
          blueprintJsonVersion: "current",
          blueprintPreviewVersion: "current",
        });
      });
    } finally {
      await host.stop();
    }
  });

  it("runs create, edit, promote, discard-draft, and delete through the Studio Cells", async () => {
    const host = await createNodeHost({
      profile: "blueprint-studio",
      environment: {},
      port: 0,
    });
    try {
      await host.controlface.whenIdle();
      await host.controlface.emit({
        node: "blueprint-new-form",
        name: "save",
        payload: {
          values: {
            id: "studio-workflow-test",
            kind: "runtime-blueprint",
            version: "1.0.0",
          },
        },
      });
      await host.controlface.whenIdle();
      await eventually(() => {
        expect(host.controlface.getState().studio).toMatchObject({
          selectedBlueprintId: "studio-workflow-test",
          selected: {
            id: "studio-workflow-test",
            artifact: null,
            draft: {
              id: "studio-workflow-test.draft",
              artifact: {
                payload: {
                  id: "studio-workflow-test.draft",
                  kind: "runtime-blueprint",
                  version: "1.0.0",
                },
              },
            },
          },
          activeTab: "blueprint-json",
          blueprintJsonVersion: "draft",
          blueprintPreviewVersion: "draft",
        });
      });

      const createdDraft = structuredClone(
        (host.controlface.getState().studio as {
          selected: { draft: { artifact: Record<string, unknown> } };
        }).selected.draft.artifact,
      );
      (createdDraft.payload as Record<string, unknown>).version = "1.1.0";
      await host.controlface.emit({
        node: "blueprint-draft-form-pane",
        name: "save",
        payload: { values: createdDraft },
      });
      await host.controlface.whenIdle();
      await eventually(() => {
        expect(host.controlface.getState().studio).toMatchObject({
          selected: {
            draft: {
              version: "1.1.0",
              revision: 2,
            },
          },
        });
      });

      await host.controlface.emit({
        node: "blueprint-json-version-switch",
        name: "toggle",
        payload: { checked: false, value: "current" },
      });
      expect(host.controlface.getState().studio).toMatchObject({
        blueprintJsonVersion: "current",
      });

      await host.controlface.emit({
        node: "blueprint-promote-draft-action",
        name: "press",
        payload: {},
      });
      await host.controlface.whenIdle();
      await eventually(() => {
        expect(host.controlface.getState().studio).toMatchObject({
          selectedBlueprintId: "studio-workflow-test",
          selected: {
            id: "studio-workflow-test",
            version: "1.1.0",
            source: "user",
            readonly: false,
            draft: null,
          },
          activeTab: "overview",
        });
      });

      await host.controlface.emit({
        node: "blueprint-edit-action",
        name: "press",
        payload: {},
      });
      await host.controlface.whenIdle();
      await eventually(() => {
        expect(host.controlface.getState().studio).toMatchObject({
          selected: {
            id: "studio-workflow-test",
            draft: {
              id: "studio-workflow-test.draft",
              artifact: {
                payload: {
                  id: "studio-workflow-test.draft",
                  version: "1.1.0",
                },
              },
            },
          },
          activeTab: "blueprint-json",
          blueprintJsonVersion: "draft",
          blueprintPreviewVersion: "draft",
        });
      });

      await host.controlface.emit({
        node: "blueprint-delete-draft-action",
        name: "press",
        payload: {},
      });
      await host.controlface.whenIdle();
      await eventually(() => {
        expect(host.controlface.getState().studio).toMatchObject({
          selected: {
            id: "studio-workflow-test",
            draft: null,
          },
          activeTab: "blueprint-json",
          blueprintJsonVersion: "current",
          blueprintPreviewVersion: "current",
        });
      });

      await host.controlface.emit({
        node: "blueprint-delete-action",
        name: "press",
        payload: {},
      });
      await host.controlface.whenIdle();
      await eventually(() => {
        expect(host.controlface.getState().studio).toMatchObject({
          selectedBlueprintId: "",
          selected: null,
          activeTab: "overview",
        });
        expect((host.controlface.getState().studio as { blueprints: Array<{ id: string }> })
          .blueprints.map(({ id }) => id)).not.toContain("studio-workflow-test");
      });

    } finally {
      await host.stop();
    }
  });

  it("clones a published Blueprint into a new draft through the New Blueprint form", async () => {
    const host = await createNodeHost({
      profile: "blueprint-studio",
      environment: {},
      port: 0,
    });
    try {
      await host.controlface.whenIdle();
      await host.controlface.emit({
        node: "blueprint-new-form",
        name: "save",
        payload: {
          values: {
            cloneFrom: "portfolio-tracker-new",
            id: "studio-clone-test",
            kind: "portfolio-blueprint",
            version: "2.0.0",
          },
        },
      });
      await host.controlface.whenIdle();
      await eventually(() => {
        expect(host.controlface.getState().studio).toMatchObject({
          selectedBlueprintId: "studio-clone-test",
          selected: {
            id: "studio-clone-test",
            artifact: null,
            draft: {
              id: "studio-clone-test.draft",
              artifact: {
                payload: {
                  id: "studio-clone-test.draft",
                  kind: "portfolio-blueprint",
                  version: "2.0.0",
                  contextFormSpec: expect.any(Object),
                  recipes: expect.any(Array),
                },
              },
            },
          },
          activeTab: "blueprint-json",
          blueprintJsonVersion: "draft",
          blueprintPreviewVersion: "draft",
        });
      });
    } finally {
      await host.stop();
    }
  });
});
