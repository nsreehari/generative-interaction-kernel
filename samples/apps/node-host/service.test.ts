import assert from "node:assert/strict";
import { test } from "vitest";
import { UnsatisfiedServiceDependencyError } from "@gik/controlface";
import { unwrap } from "@gik/kernel";
import { createNodeHost } from "./service";
import { processContinuityQueue } from "./continuity-worker";
import { getNodeBlueprintCatalog } from "./catalog";
import { openNodeLaunch } from "./runtime";

async function callMcp<T>(baseUrl: string, path: string, name: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const reply = (await response.json()) as { result: { structuredContent: T } };
  return reply.result.structuredContent;
}

test("backend order profile executes the catalog Blueprint", async () => {
  const host = await createNodeHost({ profile: "backend-order", port: 0 });
  await host.listen();
  await host.controlface.emit({
    node: "order-controller",
    name: "submit",
    payload: { orderId: "ord-42", amount: 129.5 },
  });
  await host.controlface.whenIdle();
  const state = host.controlface.getState();
  const order = state.order as Record<string, unknown>;
  const payment = state.payment as Record<string, unknown>;
  assert.equal(order.status, "confirmed");
  assert.equal(order.fulfillment, "queued");
  assert.deepEqual(payment.receipt, { id: "rcpt_129", amount: 129.5, status: "captured" });
  await host.stop();
});

test("the Node host opens its registered launch profiles", async () => {
  const catalog = await getNodeBlueprintCatalog();
  const profileIds = [
    "backend-order",
    "middleware-continuity",
    "portfolio-tracker-new",
  ];
  const profiles = profileIds.map((id) => catalog.launchProfiles.find((profile) => profile.id === id));
  assert.deepEqual(profiles.map((profile) => profile?.id), profileIds);
  for (const profileId of profileIds) {
    await openNodeLaunch(profileId, { "intelligence-model": "mock", view: "desktop" });
  }
});

test("the Node host can execute a Blueprint with a presentation program", async () => {
  const { runtime } = await openNodeLaunch("samples-overview");
  assert.ok(unwrap(runtime.program).root);
});

test("the Node host materializes ai-agent service endpoints from its environment", async () => {
  const { runtime } = await openNodeLaunch("ai-agent", undefined, {
    GIK_FOUNDRY_PROXY_ORIGIN: "http://localhost:7071",
  });
  const services = unwrap(runtime.vocabulary).externals?.services as Record<
    string,
    { config?: { endpoint?: string } }
  >;

  assert.equal(services.assistant.config?.endpoint, "http://localhost:7071");
});

test("the Node host throws an unsatisfied dependency when ai-agent discovery has no Foundry key", async () => {
  const host = await createNodeHost({
    profile: "ai-agent",
    port: 0,
    environment: {},
  });
  try {
    await assert.rejects(
      () => host.controlface.whenIdle(),
      (error: unknown) => error instanceof UnsatisfiedServiceDependencyError
        && error.dependency.kind === "credential"
        && error.dependency.ref === "foundry-agent/access-key",
    );
  } finally {
    await host.stop();
  }
});

test("continuity profile serves its catalog Blueprint to MCP and the worker", async () => {
  const host = await createNodeHost({
    profile: "middleware-continuity",
    port: 0,
    hostName: "127.0.0.1",
  });
  const baseUrl = await host.listen();
  assert.equal(host.blueprintId, "middleware-continuity");

  const queued = await callMcp<{ rev: number }>(baseUrl, "/mcp-control", "emit", {
    event: { node: "continuity-controller", name: "queue" },
  });
  assert.equal(queued.rev, 1);
  assert.deepEqual(await processContinuityQueue(baseUrl), { processed: true, rev: 2 });

  const state = await callMcp<{ continuity: { job: { status: string; result: string } } }>(
    baseUrl,
    "/mcp",
    "getState",
    {},
  );
  assert.equal(state.continuity.job.status, "completed");
  assert.equal(state.continuity.job.result, "background-analysis-ready");
  await host.stop();
});