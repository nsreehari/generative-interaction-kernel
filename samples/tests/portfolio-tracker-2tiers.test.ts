import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import {
  materializeBlueprint,
  parseBlueprintJson,
  type CellDefinition,
  type RepresentationLoweringRecipeDefinition,
} from "@gik/blueprint";

const sampleUrl = new URL("../blueprints/portfolio-tracker-2tiers/blueprint.json", import.meta.url);

function stableFacets(cells: Record<string, CellDefinition>): Record<string, CellDefinition> {
  return Object.fromEntries(Object.entries(cells).map(([id, cell]) => {
    const { view: _view, ...stable } = cell;
    return [id, stable];
  }));
}

test("portfolio tracker lowers representation while preserving all seven Cells", () => {
  const authored = parseBlueprintJson<RepresentationLoweringRecipeDefinition>(readFileSync(sampleUrl, "utf8"));
  const authoredCells = authored.payload.cells ?? {};
  const authoredStableFacets = stableFacets(authoredCells);

  const desktop = materializeBlueprint({
    blueprint: authored,
    externalContext: { view: "desktop", attention: "detailed" },
  }).payload.terminalBlueprint;
  const mobile = materializeBlueprint({
    blueprint: authored,
    externalContext: { view: "mobile", attention: "glanceable" },
  }).payload.terminalBlueprint;

  assert.deepEqual(Object.keys(authoredCells), [
    "portfolio-workspace",
    "http-proxy-access-gate",
    "holdings",
    "market-prices",
    "positions",
    "summary",
    "portfolio-status",
  ]);
  assert.deepEqual(stableFacets(desktop.payload.cells ?? {}), authoredStableFacets);
  assert.deepEqual(stableFacets(mobile.payload.cells ?? {}), authoredStableFacets);
  assert.equal(desktop.payload.cells?.["portfolio-workspace"].view?.props?.subtitle, "Desktop · Detailed");
  assert.equal(mobile.payload.cells?.["portfolio-workspace"].view?.props?.subtitle, "Mobile · Glanceable");
  assert.equal(desktop.payload.projections?.presentation?.placements?.length, 6);
  assert.equal(mobile.payload.projections?.presentation?.placements?.length, 3);
});

test("portfolio tracker falls back to desktop detailed without context", () => {
  const authored = parseBlueprintJson<RepresentationLoweringRecipeDefinition>(readFileSync(sampleUrl, "utf8"));
  const terminal = materializeBlueprint({ blueprint: authored }).payload.terminalBlueprint;

  assert.equal(terminal.payload.cells?.["portfolio-workspace"].view?.props?.subtitle, "Desktop · Detailed");
});

test("portfolio tracker declares complete HTTP service operation transforms", () => {
  const authored = parseBlueprintJson<RepresentationLoweringRecipeDefinition>(readFileSync(sampleUrl, "utf8"));
  const operations = authored.payload.services?.["portfolio-market-data"]?.operations;

  assert.equal(operations?.checkHttpProxyAccess?.settlement?.transform.kind, "jsonata");
  assert.equal(operations?.checkHttpProxyAccess?.failureSettlement?.transform.kind, "jsonata");
  assert.equal(operations?.refreshPrices?.request?.transform.kind, "jsonata");
  assert.equal(operations?.refreshPrices?.settlement?.transform.kind, "jsonata");
});
