import { describe, expect, it } from "vitest";
import { bundleFromJson, loadBundleRuntime } from "@gik/react";
import effects from "./effect_handlers/index";
import { openSampleBlueprint } from "../../shared/blueprints";
import { declarativeServiceOrchestrator } from "../../shared/service-runtime";

function runtime() {
  const blueprintRuntime = openSampleBlueprint("portfolio-tracker");
  return loadBundleRuntime(bundleFromJson({
    manifest: blueprintRuntime.manifest,
    document: blueprintRuntime.document,
    state: blueprintRuntime.state,
  }, { effectHandlers: effects }), {
    wrapOrchestrator: declarativeServiceOrchestrator(blueprintRuntime),
  });
}

describe("portfolio-tracker Blueprint runtime", () => {
  it("maintains keyed quotes, positions, and summary as tickers change", async () => {
    const portfolio = runtime();

    await portfolio.controller.emit("portfolio-tracker", "setHoldings", {
      holdings: [{ ticker: "AAPL", quantity: 8, costBasis: 178 }],
    }, "human-investor");
    expect(portfolio.state.get("portfolio.positions.AAPL")).toMatchObject({ ticker: "AAPL", quantity: 8 });

    await portfolio.controller.emit("portfolio-tracker", "upsertHolding", {
      holding: { ticker: "GOOG", quantity: 4, costBasis: 165 },
    }, "human-investor");
    expect(portfolio.state.get("portfolio.quotes.GOOG")).toMatchObject({ ticker: "GOOG" });
    expect(portfolio.state.get("portfolio.positions.GOOG")).toMatchObject({ ticker: "GOOG", quantity: 4 });

    await portfolio.controller.emit("portfolio-tracker", "removeHolding", { ticker: "AAPL" }, "human-investor");
    expect(portfolio.state.get("portfolio.holdings.AAPL")).toBeNull();
    expect(portfolio.state.get("portfolio.positions.AAPL")).toBeNull();
    expect(portfolio.state.get("portfolio.positions.GOOG")).not.toBeNull();
  });

  it("commits structured intelligence and keeps rebalance application attributable", async () => {
    const portfolio = runtime();

    await portfolio.controller.emit("portfolio-tracker", "setHoldings", {
      holdings: [
        { ticker: "NVDA", quantity: 18, costBasis: 138 },
        { ticker: "JNJ", quantity: 12, costBasis: 149 },
      ],
      investorProfile: { riskTolerance: "moderate", horizonYears: 8 },
    }, "human-investor");
    await portfolio.controller.emit(
      "portfolio-tracker",
      "requestIntelligence",
      {},
      "agent-portfolio-intelligence"
    );
    expect(portfolio.state.get("portfolio.intelligence")).toMatchObject({
      provider: "portfolio-intelligence-deterministic",
      risks: ["single-name concentration", "market-price volatility"],
    });

    await portfolio.controller.emit(
      "portfolio-tracker",
      "calculateStrategies",
      {},
      "agent-portfolio-intelligence"
    );
    expect(portfolio.state.get("portfolio.strategies.conservative")).toMatchObject({ id: "conservative" });
    expect(portfolio.state.get("portfolio.strategies.growth")).toMatchObject({ id: "growth" });
    expect(portfolio.state.get("portfolio.recommendation.status")).toBe("proposed");

    await portfolio.controller.emit("rebalance-comparison", "apply", {}, "human-investor");
    expect(portfolio.state.get("portfolio.appliedRecommendation")).toMatchObject({
      status: "applied",
      actorId: "human-investor",
    });
    expect(portfolio.state.get("portfolio.recommendation")).toMatchObject({
      status: "applied",
      actorId: "human-investor",
    });
    await expect(portfolio.controller.emit(
      "rebalance-comparison",
      "apply",
      {},
      "human-investor"
    )).rejects.toThrow("A proposed recommendation is required");
  });

  it("rejects recommendation application without a proposal or attributed actor", async () => {
    const portfolio = runtime();

    await expect(portfolio.controller.emit(
      "rebalance-comparison",
      "apply",
      {},
      "human-investor"
    )).rejects.toThrow("A proposed recommendation is required");

    await portfolio.controller.emit("portfolio-tracker", "requestIntelligence", {}, "agent-portfolio-intelligence");
    await portfolio.controller.emit("portfolio-tracker", "calculateStrategies", {}, "agent-portfolio-intelligence");
    await expect(portfolio.controller.emit(
      "rebalance-comparison",
      "apply"
    )).rejects.toThrow("requires an attributed actor");
    expect(portfolio.state.get("portfolio.appliedRecommendation")).toBeNull();
    expect(portfolio.state.get("portfolio.recommendation.status")).toBe("proposed");
  });

  it("accepts an arbitrary high-cardinality ticker set without new commands", async () => {
    const portfolio = runtime();
    const holdings = Array.from({ length: 250 }, (_, index) => ({
      ticker: `TICK${index}`,
      quantity: index + 1,
      costBasis: 50 + index,
    }));

    await portfolio.controller.emit("portfolio-tracker", "setHoldings", { holdings }, "human-investor");

    expect(Object.keys(portfolio.state.get("portfolio.holdings") as object)).toHaveLength(250);
    expect(portfolio.state.get("portfolio.quotes.TICK249")).toMatchObject({ ticker: "TICK249" });
    expect(portfolio.state.get("portfolio.positions.TICK249")).toMatchObject({ quantity: 250 });
  });
});
