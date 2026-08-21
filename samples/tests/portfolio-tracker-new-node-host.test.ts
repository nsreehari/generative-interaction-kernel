import assert from "node:assert/strict";
import { test } from "vitest";

import { createNodeHost } from "../apps/node-host/service";

interface McpReply<T> {
  result?: { structuredContent: T };
  error?: { message?: string };
}

async function callMcp<T>(
  baseUrl: string,
  path: string,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const reply = (await response.json()) as McpReply<T>;
  if (!response.ok || reply.error || !reply.result) {
    throw new Error(reply.error?.message ?? `MCP ${name} failed with HTTP ${response.status}`);
  }
  return reply.result.structuredContent;
}

async function waitForState(
  baseUrl: string,
  predicate: (state: Record<string, any>) => boolean,
): Promise<Record<string, any>> {
  const deadline = Date.now() + 10_000;
  let state: Record<string, any> = {};
  while (Date.now() < deadline) {
    state = await callMcp<Record<string, any>>(baseUrl, "/mcp", "getState", {});
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for portfolio state: ${JSON.stringify(state.portfolio)}`);
}

test("portfolio-tracker-new executes through the headless Node host HTTP control plane", async () => {
  const host = await createNodeHost({
    profile: "portfolio-tracker-new",
    externalContext: { "intelligence-model": "mock", view: "desktop" },
    environment: {},
    hostName: "127.0.0.1",
    port: 0,
  });
  const baseUrl = await host.listen();
  try {
    assert.ok(host.controlface.getProgram().root);
    const initial = await waitForState(
      baseUrl,
      (state) => state.portfolio?.intelligence?.provider === "portfolio-intelligence-mock",
    );
    assert.deepEqual(Object.keys(initial.portfolio.stockQuotes).sort(), ["AAPL", "MSFT"]);
    assert.deepEqual(initial.portfolio.value.summary, {
      marketValue: 1499.29,
      costBasis: 720,
      gainLoss: 779.29,
    });
    assert.equal(initial.portfolio.intelligence.provider, "portfolio-intelligence-mock");

    const save = (rows: Record<string, unknown>[]) => callMcp<{ rev: number }>(
      baseUrl,
      "/mcp-control",
      "emit",
      { event: { node: "portfolio-holdings--primary--in-holdings", name: "save", payload: { rows } } },
    );
    await save([
      { ticker: "AAPL", quantity: 2, costBasis: 90 },
      { ticker: "MSFT", quantity: 3, costBasis: 180 },
      { ticker: "GOOG", quantity: 4, costBasis: 150 },
    ]);
    await save([
      { ticker: "AAPL", quantity: 1, costBasis: 90 },
      { ticker: "AMZN", quantity: 5, costBasis: 300 },
    ]);
    await save([
      { ticker: "AAPL", quantity: 1, costBasis: 90 },
      { ticker: "GOOG", quantity: 2, costBasis: 300 },
    ]);
    const updated = await waitForState(
      baseUrl,
      (state) => state.portfolio?.intelligence?.markdown?.includes("Largest position: GOOG") === true,
    );
    assert.deepEqual(Object.keys(updated.portfolio.holdings).sort(), ["AAPL", "GOOG"]);
    assert.deepEqual(Object.keys(updated.portfolio.stockQuotes).sort(), ["AAPL", "GOOG"]);
    assert.equal("AMZN" in updated.portfolio.value.positions, false);
    assert.deepEqual(updated.portfolio.value.summary, {
      marketValue: 882.07,
      costBasis: 690,
      gainLoss: 192.07,
    });
    assert.match(updated.portfolio.intelligence.markdown, /Largest position: GOOG/);
    assert.match(updated.portfolio.intelligence.markdown, /Market value: 882.07/);
    assert.match(updated.portfolio.intelligence.markdown, /Gain\/loss: 192.07/);
  } finally {
    await host.stop();
  }
});