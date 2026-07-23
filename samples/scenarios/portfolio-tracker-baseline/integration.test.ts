import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bundleFromJson, loadBundleRuntime, SharedContextStore } from "@gik/react";
import { dispatchDemoControlRequest } from "../../bundles/demo-runner/effect_handlers/control-bridge";
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

});
