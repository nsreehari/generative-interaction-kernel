// Safe expression subset (ADR-0028). Predicate positions — visibility gates and action /
// machine guards — are agent-authored and adversarial, so the platform routes them through a
// provider that rejects $eval, function definitions (lambda), and transform at COMPILE time.
// Value positions (derive / assign-from) stay on the full provider. These constructs cannot be
// corpus-gated against the canonical engine (canonical returns values for them), so the
// rejection is asserted directly here.

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  InMemoryStateModel,
  JsonataExpressionProvider,
  SafeExpressionError,
  reduce,
  resolveNode,
  type CapabilityRegistry,
  type DocumentPayload,
} from "../src/index";

const UNSAFE: Array<[string, string]> = [
  ["$eval", '$eval("1+1")'],
  ["function definition", "function($x){ $x + 1 }(1)"],
  ["transform", 'payload ~> | $ | { "seen": true } |'],
];

test("safe provider rejects $eval, function definitions, and transform at compile time", async () => {
  const safe = new JsonataExpressionProvider({ safe: true });
  for (const [label, expr] of UNSAFE) {
    await assert.rejects(
      () => safe.eval(expr, {}),
      (err: unknown) => err instanceof SafeExpressionError,
      `expected ${label} to be rejected`
    );
  }
});

test("safe provider still evaluates ordinary predicates", async () => {
  const safe = new JsonataExpressionProvider({ safe: true });
  assert.equal(await safe.eval("count > 3 and $exists(user.id)", { count: 4, user: { id: "u1" } }), true);
  assert.equal(await safe.eval("count > 3", { count: 1 }), false);
});

test("the full provider permits the same constructs (policy lives in the provider, not the language)", async () => {
  const full = new JsonataExpressionProvider();
  assert.equal(await full.eval('$eval("1+1")', {}), 2);
  assert.equal(await full.eval("function($x){ $x * 2 }(21)", {}), 42);
});

test("resolveNode routes the visibility gate through the predicate provider", async () => {
  const registry: CapabilityRegistry = { has: () => true, get: () => undefined };
  const store = new InMemoryStateModel(["ns"]);
  const node = { id: "root", capability: "x", edges: { gate: '$eval("true")' } };

  await assert.rejects(
    () =>
      resolveNode(node, {
        store,
        expr: new JsonataExpressionProvider(),
        predicateExpr: new JsonataExpressionProvider({ safe: true }),
        registry,
      }),
    (err: unknown) => err instanceof SafeExpressionError
  );

  // With no predicate provider the gate falls back to the full provider (unchanged behavior).
  const resolved = await resolveNode(node, {
    store,
    expr: new JsonataExpressionProvider(),
    registry,
  });
  assert.equal(resolved.visible, true);
});

test("reduce rejects an unsafe action guard but still allows a lambda in a derive value", async () => {
  const store = new InMemoryStateModel(["ns"]);
  const event = { node: "root", name: "tap", payload: {} };

  const guardedDoc = {
    root: {
      id: "root",
      capability: "x",
      edges: { on: { tap: [{ do: "assign", target: "ns.a", args: { value: 1 }, guard: "function($x){ $x }(true)" }] } },
    },
  } as unknown as DocumentPayload;

  await assert.rejects(
    () => reduce(guardedDoc, store, event, new JsonataExpressionProvider(), new JsonataExpressionProvider({ safe: true })),
    (err: unknown) => err instanceof SafeExpressionError
  );

  const deriveDoc = {
    root: {
      id: "root",
      capability: "x",
      edges: { on: { tap: [{ do: "derive", target: "ns.b", args: { expr: "function($x){ $x * 2 }(21)" } }] } },
    },
  } as unknown as DocumentPayload;

  const { ops } = await reduce(
    deriveDoc,
    store,
    event,
    new JsonataExpressionProvider(),
    new JsonataExpressionProvider({ safe: true })
  );
  assert.deepEqual(ops, [{ op: "set", path: "ns.b", value: 42 }]);
});
