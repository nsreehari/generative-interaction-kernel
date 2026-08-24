import { describe, expect, it } from "vitest";
import {
  collectPresentationRegionExportErrors,
  createBlueprint,
  listExportedPresentationRegions,
  materializeBlueprint,
  BlueprintValidationError,
  type BlueprintArtifact,
  type BlueprintDefinition,
  type PresentationDefinition,
} from "../src/index";

const cells = {
  status: {
    id: "status",
    potentialViews: {
      primary: { capability: "ui:text", region: "primary" },
    },
  },
} as const;

function shell(presentation: PresentationDefinition, id = "shell"): BlueprintArtifact {
  return createBlueprint({
    id,
    kind: "runtime-blueprint",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-program" }],
    projectionRecipes: [],
    runtime: {},
    cells,
    presentation,
  } as BlueprintDefinition);
}

const layout: PresentationDefinition = {
  slots: [
    "shell",
    { id: "command-bar", region: "shell" },
    { id: "sidebar", region: "shell" },
    { id: "primary", region: "shell" },
  ],
  root: "shell",
};

describe("exported presentation regions", () => {
  it("discovers declared regions with normalized metadata in declaration order", () => {
    const blueprint = shell({
      ...layout,
      exportedRegions: [
        { name: "command-bar", slot: "command-bar", required: true, description: "Global actions" },
        { name: "sidebar", slot: "sidebar" },
      ],
    });

    expect(listExportedPresentationRegions(blueprint)).toEqual([
      { name: "command-bar", slot: "command-bar", required: true, description: "Global actions" },
      { name: "sidebar", slot: "sidebar", required: false },
    ]);
  });

  it("exports nothing when a presentation declares no regions", () => {
    expect(listExportedPresentationRegions(shell(layout))).toEqual([]);
    expect(listExportedPresentationRegions(undefined)).toEqual([]);
  });

  it("does not change how the presentation itself compiles", () => {
    const withoutExports = materializeBlueprint({ blueprint: shell(layout) });
    const withExports = materializeBlueprint({
      blueprint: shell({ ...layout, exportedRegions: [{ name: "primary", slot: "primary" }] }),
    });

    expect(withExports.payload.program).toEqual(withoutExports.payload.program);
  });

  it("rejects an export that targets an unknown slot", () => {
    expect(() => shell({ ...layout, exportedRegions: [{ name: "primary", slot: "nowhere" }] }))
      .toThrow(/region 'primary' exports unknown slot 'nowhere'/);
  });

  it("rejects a duplicate region name", () => {
    expect(() => shell({
      ...layout,
      exportedRegions: [{ name: "primary", slot: "primary" }, { name: "primary", slot: "sidebar" }],
    })).toThrow(/exports region 'primary' more than once/);
  });

  it("rejects an invalid region name", () => {
    expect(() => shell({ ...layout, exportedRegions: [{ name: "not a name", slot: "primary" }] }))
      .toThrow(BlueprintValidationError);
    expect(collectPresentationRegionExportErrors(
      { ...layout, exportedRegions: [{ name: "not a name", slot: "primary" }] },
      "shell",
    )).toEqual(["Blueprint 'shell' presentation exports an invalid region name 'not a name'"]);
    expect(collectPresentationRegionExportErrors(
      { ...layout, exportedRegions: [{ name: "", slot: "primary" }] },
      "shell",
    )).toHaveLength(1);
  });

  it("rejects an export of a slot unreachable from the presentation root", () => {
    expect(() => shell({
      slots: ["shell", { id: "primary", region: "shell" }, "detached"],
      root: "shell",
      exportedRegions: [{ name: "detached", slot: "detached" }],
    })).toThrow(/exports slot 'detached' that is unreachable from root 'shell'/);
  });

  it("rejects overlapping exports so no slot can render twice", () => {
    expect(() => shell({
      ...layout,
      exportedRegions: [{ name: "shell", slot: "shell" }, { name: "primary", slot: "primary" }],
    })).toThrow(/exports slot 'primary' that overlaps region 'shell' slot 'shell'/);
    expect(() => shell({
      ...layout,
      exportedRegions: [{ name: "primary", slot: "primary" }, { name: "same", slot: "primary" }],
    })).toThrow(/overlaps region 'primary'/);
  });

  it("exposes the region set of the terminal representation selected by external context", () => {
    const blueprint = createBlueprint({
      id: "adaptive-shell",
      kind: "intent-blueprint",
      version: "1",
      serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
      serviceRecipes: [],
      projectionTiers: [
        { id: "intent", kind: "interaction-intent" },
        { id: "runtime", kind: "runtime-program" },
      ],
      projectionRecipes: [{
        id: "intent-to-runtime",
        from: "intent",
        to: "runtime",
        representations: [
          {
            id: "default",
            views: { status: { primary: { capability: "ui:text", region: "primary" } } },
            presentation: {
              ...layout,
              exportedRegions: [
                { name: "primary", slot: "primary", required: true },
                { name: "sidebar", slot: "sidebar" },
              ],
            },
          },
          {
            id: "compact",
            when: "externalContext.device = 'phone'",
            views: { status: { primary: { capability: "ui:text", region: "primary" } } },
            presentation: {
              slots: ["shell", { id: "primary", region: "shell" }],
              root: "shell",
              exportedRegions: [{ name: "primary", slot: "primary", required: true }],
            },
          },
        ],
        fallback: "default",
      }],
      runtime: {},
      cells,
      presentation: { slots: ["shell", { id: "primary", region: "shell" }], root: "shell" },
    } as BlueprintDefinition);

    const wide = materializeBlueprint({ blueprint, externalContext: { device: "desktop" } });
    const compact = materializeBlueprint({ blueprint, externalContext: { device: "phone" } });

    expect(listExportedPresentationRegions(wide.payload.terminalBlueprint).map((region) => region.name))
      .toEqual(["primary", "sidebar"]);
    expect(listExportedPresentationRegions(compact.payload.terminalBlueprint).map((region) => region.name))
      .toEqual(["primary"]);
  });
});
