import assert from "node:assert/strict";
import { test } from "vitest";

import {
  Kernel,
  DerivationScheduler,
  InMemoryStateModel,
  JsonataExpressionProvider,
  assignFrom,
  authorProjectedProgram,
  envelope,
  node,
} from "../src/index";

test("settles affected standing derivations in dependency order", async () => {
  const store = new InMemoryStateModel(["portfolio"]);
  store.apply([
    { op: "set", path: "portfolio.quantity", value: 3 },
    { op: "set", path: "portfolio.price", value: 10 },
  ]);
  const scheduler = new DerivationScheduler([
    {
      id: "summary",
      target: "portfolio.summary",
      expression: "{'marketValue': portfolio.marketValue}",
      dependencies: ["portfolio.marketValue"],
    },
    {
      id: "market-value",
      target: "portfolio.marketValue",
      expression: "portfolio.quantity * portfolio.price",
      dependencies: ["portfolio.quantity", "portfolio.price"],
    },
  ]);

  const operations = await scheduler.settle(
    ["portfolio.price"],
    store,
    new JsonataExpressionProvider(),
  );

  assert.deepEqual(operations.map((operation) => operation.path), [
    "portfolio.marketValue",
    "portfolio.summary",
  ]);
  assert.equal(store.get("portfolio.marketValue"), 30);
  assert.deepEqual(
    JSON.parse(JSON.stringify(store.get("portfolio.summary"))),
    { marketValue: 30 },
  );
});

test("suppresses unchanged derived values", async () => {
  const store = new InMemoryStateModel(["app"]);
  store.apply([
    { op: "set", path: "app.value", value: 2 },
    { op: "set", path: "app.double", value: 4 },
  ]);
  const scheduler = new DerivationScheduler([{
    id: "double",
    target: "app.double",
    expression: "app.value * 2",
    dependencies: ["app.value"],
  }]);

  assert.deepEqual(
    await scheduler.settle(["app.value"], store, new JsonataExpressionProvider()),
    [],
  );
});

test("rejects standing derivation cycles", () => {
  assert.throws(() => new DerivationScheduler([
    { id: "a", target: "app.a", expression: "app.b", dependencies: ["app.b"] },
    { id: "b", target: "app.b", expression: "app.a", dependencies: ["app.a"] },
  ]), /cycle.*app\.a.*app\.b.*app\.a/i);
});

test("kernel settles standing derivations into the initiating patch", async () => {
  const manifest = envelope("vocabulary", {
    version: "derivations/1",
    namespaces: ["portfolio"],
    capabilities: { input: { emits: ["setPrice"] } },
  });
  const document = authorProjectedProgram(
    node("input", "price", {
      on: { setPrice: [assignFrom("portfolio.price", "$event.price")] },
    }),
    {
      vocabulary: "derivations/1",
      derivations: [
        {
          id: "market-value",
          target: "portfolio.marketValue",
          expression: "portfolio.quantity * portfolio.price",
          dependencies: ["portfolio.quantity", "portfolio.price"],
        },
        {
          id: "summary",
          target: "portfolio.summary",
          expression: "{'marketValue': portfolio.marketValue}",
          dependencies: ["portfolio.marketValue"],
        },
      ],
    },
  );
  const state = new InMemoryStateModel(["portfolio"]);
  state.apply([{ op: "set", path: "portfolio.quantity", value: 4 }]);
  const kernel = new Kernel(manifest, document, { state });

  const patch = await kernel.dispatch({
    node: "price",
    name: "setPrice",
    payload: { price: 25 },
  });

  assert.deepEqual(patch.ops.map((operation) => operation.path), [
    "portfolio.price",
    "portfolio.marketValue",
    "portfolio.summary",
  ]);
  assert.equal((kernel.state() as any).portfolio.marketValue, 100);
  assert.equal(patch.rev, 1);
});

test("restore publishes derived writes with the restored namespace", async () => {
  const manifest = envelope("vocabulary", {
    version: "derivations/1",
    namespaces: ["portfolio"],
    capabilities: {},
  });
  const document = authorProjectedProgram(node("text", "summary"), {
    vocabulary: "derivations/1",
    derivations: [{
      id: "market-value",
      target: "portfolio.marketValue",
      expression: "portfolio.quantity * portfolio.price",
      dependencies: ["portfolio.quantity", "portfolio.price"],
    }],
  });
  const kernel = new Kernel(manifest, document);

  const patch = await kernel.restore({
    rev: 0,
    state: { portfolio: { quantity: 4, price: 10, marketValue: 999 } },
  });

  assert.deepEqual(patch.ops.map((operation) => operation.path), [
    "portfolio",
    "portfolio.marketValue",
  ]);
  assert.equal((kernel.state() as any).portfolio.marketValue, 40);
});