import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bundleFromJson, loadBundleRuntime, SharedContextStore } from "@gik/react";
import { dispatchDemoControlRequest, withDemoHumanGate } from "../../bundles/demo-runner/effect_handlers/control-bridge";
import runnerDocument from "../../bundles/demo-runner/document.json" with { type: "json" };
import runnerEffects from "../../bundles/demo-runner/effect_handlers/index";
import runnerManifest from "../../bundles/demo-runner/manifest.json" with { type: "json" };
import runnerState from "../../bundles/demo-runner/state.json" with { type: "json" };
import portfolioEffects from "../../bundles/portfolio-tracker/effect_handlers/index";
import type { ControlRequest } from "../../shared/control-runtime";
import { resolveDemoComposition } from "../../shared/demo-catalog";
import { openSampleBlueprint } from "../../shared/blueprints";
import { declarativeServiceOrchestrator } from "../../shared/service-runtime";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { responseSchema?: { name?: string } };
    const intelligence = String(body.responseSchema?.name ?? "").startsWith("portfolio-intelligence");
    const reply = intelligence
      ? {
          summary: "The portfolio has two individual-equity positions.",
          observations: ["NVDA has the larger market-value weight."],
          risks: ["Single-name concentration may amplify drawdowns."],
          evidence: ["Supplied portfolio positions and current market context."],
          asOf: "2026-07-22",
        }
      : {
          strategies: {
            conservative: { id: "conservative", rationale: "Reduce concentration.", targetWeights: [{ ticker: "NVDA", weight: 0.4 }, { ticker: "JNJ", weight: 0.6 }] },
            growth: { id: "growth", rationale: "Retain growth exposure.", targetWeights: [{ ticker: "NVDA", weight: 0.65 }, { ticker: "JNJ", weight: 0.35 }] },
          },
          recommendation: { selected: "conservative", reason: "Matches moderate risk tolerance.", status: "proposed" },
        };
    return new Response(JSON.stringify({
      conversationId: "scenario-conversation",
      responseId: "scenario-response",
      reply: JSON.stringify(reply),
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const portfolioBaselineComposition = resolveDemoComposition("portfolio-baseline");
const portfolioBaselineScenarioPlan = portfolioBaselineComposition.scenarioPlan;
const portfolioControlContract = portfolioBaselineComposition.controlContract;

function demoRuntimes() {
  const portfolioRuntime = openSampleBlueprint("portfolio-tracker");
  const shared = SharedContextStore.create(["demo", "control"]);
  shared.apply([
    { op: "set", path: "demo", value: {
      enabled: true,
      act: 0,
      presenter: { pace: "auto", durationMs: 1600, locked: false, advanceToken: 0 },
      request: null,
      timeline: [],
      selection: null,
    } },
    { op: "set", path: "control", value: { request: null, receipt: null, commands: {} } },
  ]);
  const contexts = { demo: shared, control: shared };
  const portfolio = loadBundleRuntime(bundleFromJson({
    manifest: portfolioRuntime.manifest,
    document: portfolioRuntime.document,
    state: portfolioRuntime.state,
  }, { effectHandlers: portfolioEffects }), {
    contexts,
    wrapOrchestrator: declarativeServiceOrchestrator(portfolioRuntime, {
      resolveCredential: async () => "foundry-access-key",
      authorizeEndpoint: async () => true,
    }),
  });
  const runnerSeed = structuredClone(runnerState) as Record<string, unknown>;
  runnerSeed.runner = {
    plan: portfolioBaselineScenarioPlan,
    catalog: [],
    entry: null,
    presentationPresets: portfolioBaselineComposition.demoContract.presentationPresets,
  };
  const runner = loadBundleRuntime(bundleFromJson({
    manifest: structuredClone(runnerManifest),
    document: structuredClone(runnerDocument),
    state: runnerSeed,
  }, { effectHandlers: runnerEffects }), contexts);
  return { shared, portfolio, runner };
}

describe("portfolio demo-runner composition", () => {
  it("dispatches a scenario payload and advances after the host receipt", async () => {
    const { shared, portfolio, runner } = demoRuntimes();
    await portfolio.controller.start();
    await runner.controller.start();

    await runner.controller.emit("next-act-timer-region", "press", { reason: "manual" });
    expect(shared.get("control.receipt")).toBeNull();

    const request = shared.get("control.request") as unknown as ControlRequest;
    await dispatchDemoControlRequest(portfolio.controller, shared, portfolioControlContract, request);
    expect(shared.get("control.receipt")).toMatchObject({
      command: "setHoldings",
      status: "completed",
      token: 1,
    });
    expect(portfolio.state.get("portfolio.holdings.AAPL")).toMatchObject({ quantity: 10 });
    expect(portfolio.state.get("portfolio.holdings.MSFT")).toMatchObject({ quantity: 5 });

    await runner.controller.resync();
    await runner.controller.emit("demo-runner", "finishAct");
    expect(shared.get("demo.act")).toBe(1);
    expect(shared.get("demo.presenter.locked")).toBe(false);
  });

  it("completes a recommendation gate only through the attributed product event", async () => {
    const { shared, portfolio } = demoRuntimes();
    await portfolio.controller.start();
    await portfolio.controller.emit("portfolio-tracker", "setHoldings", {
      holdings: [
        { ticker: "NVDA", quantity: 18, costBasis: 138 },
        { ticker: "JNJ", quantity: 12, costBasis: 149 },
      ],
      investorProfile: { riskTolerance: "moderate", horizonYears: 8 },
    });
    await portfolio.controller.settle();
    await portfolio.controller.emit("portfolio-tracker", "requestIntelligence");
    await portfolio.controller.settle();
    await portfolio.controller.emit("portfolio-tracker", "calculateStrategies");
    await portfolio.controller.settle();
    const request: ControlRequest = {
      id: "portfolio-apply:1",
      targetBlueprintId: "portfolio-tracker",
      token: 4,
      command: "$human-gate",
      commands: ["applyRecommendation"],
      actorId: "human-investor",
    };
    shared.apply([{ op: "set", path: "control.request", value: request }]);

    const source = withDemoHumanGate(portfolio.controller, shared, portfolioControlContract);
    await expect(source.emit("rebalance-comparison", "apply", {})).rejects.toThrow("attributed actor");
    expect(shared.get("control.receipt")).toBeNull();

    await source.emit("rebalance-comparison", "apply", {}, "human-investor");
    await portfolio.controller.settle();

    expect(portfolio.state.get("portfolio.appliedRecommendation")).toMatchObject({
      status: "applied",
      actorId: "human-investor",
    });
    expect(shared.get("control.receipt")).toMatchObject({
      command: "$human-gate",
      status: "completed",
      token: 4,
      outcome: "authorized",
    });
  });

  it("rejects automatic dispatch of a human-gated command", async () => {
    const { shared, portfolio } = demoRuntimes();
    await portfolio.controller.start();
    const request: ControlRequest = {
      id: "portfolio-apply:auto",
      targetBlueprintId: "portfolio-tracker",
      token: 5,
      command: "applyRecommendation",
      actorId: "human-investor",
    };

    const receipt = await dispatchDemoControlRequest(
      portfolio.controller,
      shared,
      portfolioControlContract,
      request
    );

    expect(receipt).toMatchObject({
      status: "rejected",
      outcome: "human-authorization-required",
    });
  });
});
