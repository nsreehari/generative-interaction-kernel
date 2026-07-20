import { describe, expect, it } from "vitest";
import {
  analyzeCellComposition,
  type CellDefinition,
} from "@gik/profile";

import { openSampleBlueprint } from "../shared/blueprints";
import profileArtifact from "../profiles/portfolio-tracker/profile.json" with { type: "json" };

const resources = profileArtifact.payload.resources as unknown as {
  cells: { inline: CellDefinition[] };
};
const portfolioCells = resources.cells.inline;

describe("portfolio-tracker Blueprint", () => {
  it("resolves the KISS cell composition", () => {
    expect(portfolioCells.map((cell) => cell.id)).toEqual([
      "holdings",
      "market-prices",
      "positions",
      "summary",
      "portfolio-intelligence",
      "conservative-rebalance",
      "growth-rebalance",
      "rebalance-comparison",
    ]);
    const composition = analyzeCellComposition(portfolioCells);
    expect(composition.externalInputs).toEqual(["investor-profile"]);
    expect(composition.diagnostics).toEqual([]);
  });

  it("composes the runtime directly from Blueprint-owned cell bodies", () => {
    const document = openSampleBlueprint("portfolio-tracker").document.payload;
    expect(document.root.edges?.children?.map((node) => node.id)).toEqual(
      portfolioCells.map((cell) => cell.id)
    );
  });

  it("lowers the empty holdings editor with an explicit row schema", () => {
    const holdings = openSampleBlueprint("portfolio-tracker").document.payload.root.edges?.children?.find((node) => node.id === "holdings");
    expect(holdings?.props?.spec).toEqual({
      schema: {
        properties: {
          ticker: { type: "string" },
          quantity: { type: "number" },
          costBasis: { type: "number" },
        },
      },
    });
  });

  it("opens one runtime from the authored Blueprint", () => {
    const runtime = openSampleBlueprint("portfolio-tracker");
    expect(runtime.document).toMatchObject({ type: "document", payload: { root: { id: "portfolio-tracker" } } });
    expect(runtime.manifest).toMatchObject({
      type: "manifest",
      payload: { externals: { services: profileArtifact.payload.services } },
    });
    expect(runtime.state.portfolio).toMatchObject({ holdings: {}, positions: {} });
  });
});
