import { describe, expect, it } from "vitest";
import {
  analyzeCellComposition,
  type CellDefinition,
} from "@gik/profile";

import { openSampleBlueprint } from "../shared/blueprints";
import { applyHostConfig } from "../shared/host-config";
import profileArtifact from "../profiles/portfolio-tracker/profile.json" with { type: "json" };

const resources = profileArtifact.payload.resources as unknown as {
  cells: { inline: CellDefinition[] };
};
const portfolioCells = resources.cells.inline;

describe("portfolio-tracker Blueprint", () => {
  it("resolves the KISS cell composition", () => {
    expect(portfolioCells.map((cell) => cell.id)).toEqual([
      "http-proxy-access-gate",
      "holdings",
      "foundry-access-gate",
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
    const marketPrices = document.root.edges?.children?.find((node) => node.id === "market-prices");
    const accessGate = portfolioCells.find((cell) => cell.id === "http-proxy-access-gate");
    const foundryAccessGate = portfolioCells.find((cell) => cell.id === "foundry-access-gate");
    expect(accessGate?.provides).toEqual([{
      token: "http-proxy-access",
      read: "portfolio.httpProxyAccessStatus",
      when: "portfolio.httpProxyAccessStatus = 'ready'",
    }]);
    expect(portfolioCells.find((cell) => cell.id === "market-prices")?.requires).toEqual([
      "http-proxy-access",
      "holding:$TICKER",
    ]);
    expect(foundryAccessGate?.provides).toEqual([{
      token: "foundry-access",
      read: "portfolio.foundryAccessStatus",
      when: "portfolio.foundryAccessStatus = 'ready'",
    }]);
    expect(portfolioCells.find((cell) => cell.id === "portfolio-intelligence")?.requires).toContain("foundry-access");
    expect(marketPrices?.props?.externalSource).toEqual({ refreshEvent: "refresh" });
    expect(marketPrices?.edges?.on?.refresh).toEqual([{
      do: "invoke",
      args: { tool: "refreshPrices" },
    }]);
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
      payload: { externals: { services: applyHostConfig(profileArtifact.payload.services) } },
    });
    expect(runtime.state.portfolio).toMatchObject({ holdings: {}, positions: {} });
  });
});
