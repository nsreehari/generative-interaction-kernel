import { materializeBlueprint } from "@gik/blueprint";
import { openBlueprint } from "@gik/controlface/blueprint";
import { seedState } from "@gik/react";
import { describe, expect, it } from "vitest";

import { createBlueprintServiceHost } from "../apps/browser-host/src/runtime/service-host";
import { resolveSampleBlueprintSource } from "../catalog/blueprint-catalog";
import type { WorkerServiceInvocation } from "../service-kinds";

function materialize(marketPrices: "mock" | "live") {
  return materializeBlueprint({
    blueprint: resolveSampleBlueprintSource("portfolio-tracker-new"),
    externalContext: {
      ai: "foundry",
      "intelligence-model": "mock",
      "market-prices": marketPrices,
      view: "desktop",
    },
  });
}

describe("portfolio market service selection", () => {
  it("selects the declarative mock service by default and on explicit request", () => {
    for (const externalContext of [
      { "intelligence-model": "mock", view: "desktop" },
      { "intelligence-model": "mock", "market-prices": "mock", view: "desktop" },
    ]) {
      const terminal = materializeBlueprint({
        blueprint: resolveSampleBlueprintSource("portfolio-tracker-new"),
        externalContext,
      }).payload.terminalBlueprint.payload;

      expect(terminal.services?.["portfolio-market-data"]).toMatchObject({
        blueprint: { $ref: "blueprint:portfolio-tracker-mock@1.0.0" },
        version: "1",
        scope: "per-blueprint",
      });
    }
  });

  it("selects and executes the live Yahoo Finance HTTP proxy transform", async () => {
    const materialized = materialize("live");
    const terminal = materialized.payload.terminalBlueprint.payload;
    const declaration = terminal.services?.["portfolio-market-data"];

    expect(declaration).toMatchObject({
      kind: "http-service",
      version: "1",
      config: {
        credentialRef: "http-proxy/access-key",
      },
      scope: "per-blueprint",
    });

    const runtime = openBlueprint(materialized.payload.terminalBlueprint);
    let invocation: WorkerServiceInvocation | undefined;
    const host = createBlueprintServiceHost(
      runtime,
      seedState(runtime.vocabulary as Parameters<typeof seedState>[0], runtime.state),
      {
        execute: async (request) => {
          invocation = request as WorkerServiceInvocation;
          return {
            results: [{
              key: "AAPL",
              status: 200,
              url: "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d",
              meta: null,
              body: {
                chart: {
                  result: [{ meta: { regularMarketPrice: 231.456 } }],
                },
              },
            }, {
              key: "X9-Z",
              status: 200,
              url: "https://query1.finance.yahoo.com/v8/finance/chart/X9-Z?interval=1d&range=1d",
              meta: null,
              body: {
                chart: {
                  result: [{ meta: { regularMarketPrice: 87.123 } }],
                },
              },
            }],
          };
        },
      },
    );

    const result = await host.invoke({
      kind: "invoke",
      node: "market-prices",
      control: {
        tool: "refreshPrices",
        sourceId: "market-prices.source",
      },
      data: {
        holdings: {
          AAPL: { ticker: "AAPL", quantity: 2, costBasis: 90 },
          "X9-Z": { ticker: "X9-Z", quantity: 1, costBasis: 10 },
        },
      },
    });

    expect(invocation).toMatchObject({
      kind: "http-service",
      operation: "fetch-quotes",
      input: {
        requests: [{
          key: "AAPL",
          url: "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d",
        }, {
          key: "X9-Z",
          url: "https://query1.finance.yahoo.com/v8/finance/chart/X9-Z?interval=1d&range=1d",
        }],
      },
    });
    expect(result).toEqual({
      sourceOutput: {
        quotes: {
          AAPL: { ticker: "AAPL", price: 231.46 },
          "X9-Z": { ticker: "X9-Z", price: 87.12 },
        },
        provider: "yahoo-finance-http-service",
      },
    });
  });
});
