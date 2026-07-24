// Mount-time enforcement of a bundle's `externals.effectHandlers` contract: every effect-handler
// name the vocabulary declares must be supplied by the bundle's native code, or the bundle is rejected
// at load instead of silently no-op'ing the `invoke` deep in the reducer at runtime. Scoped to the
// effect arm only — `externals.projectionViews` are provider imports resolved against the floor/embed
// registries, not against `bundle.projectionViews`, so they are not checked here.

import { test } from "vitest";
import assert from "node:assert/strict";

import { assertExternalsSatisfied, bundleFromJson, loadBundle, loadBundleRuntime } from "../src/primitives";

const vocabularyWith = (effectHandlers?: string[]) => ({
  gik: "0.1",
  type: "vocabulary",
  payload: {
    version: "test/1",
    namespaces: ["app"],
    capabilities: {},
    ...(effectHandlers ? { externals: { effectHandlers } } : {}),
  },
});

const emptyProgram = {
  gik: "0.1",
  type: "program",
  payload: { root: { id: "root", capability: "board", props: {} } },
};

test("assertExternalsSatisfied: throws when a declared effect handler is missing", () => {
  const bundle = bundleFromJson(
    { vocabulary: vocabularyWith(["saveProfile"]), program: emptyProgram },
    { effectHandlers: {} }
  );
  assert.throws(() => assertExternalsSatisfied(bundle), /saveProfile/);
});

test("assertExternalsSatisfied: passes when every declared effect handler is supplied", () => {
  const bundle = bundleFromJson(
    { vocabulary: vocabularyWith(["saveProfile"]), program: emptyProgram },
    { effectHandlers: { saveProfile: () => {} } }
  );
  assert.doesNotThrow(() => assertExternalsSatisfied(bundle));
});

test("assertExternalsSatisfied: no-ops when the bundle declares no externals.effectHandlers", () => {
  const bundle = bundleFromJson(
    { vocabulary: vocabularyWith(undefined), program: emptyProgram },
    { effectHandlers: {} }
  );
  assert.doesNotThrow(() => assertExternalsSatisfied(bundle));
});

test("loadBundle: mount-time gate rejects a bundle missing a declared effect handler", () => {
  const bundle = bundleFromJson(
    { vocabulary: vocabularyWith(["charge"]), program: emptyProgram },
    { effectHandlers: {} }
  );
  assert.throws(() => loadBundle(bundle), /charge/);
});

test("loadBundleRuntime: applies a synchronous $init effect before the kernel starts", () => {
  const bundle = bundleFromJson(
    { vocabulary: vocabularyWith(undefined), program: emptyProgram, state: { app: { ready: false } } },
    {
      effectHandlers: {
        $init: () => ({ ops: [{ op: "set", path: "app.ready", value: true }] }),
      },
    }
  );

  const runtime = loadBundleRuntime(bundle);
  assert.equal(runtime.state.get("app.ready"), true);
});

test("loadBundleRuntime: composes bundle service orchestration inside host policy", async () => {
  const order: string[] = [];
  const bundle = bundleFromJson(
    {
      vocabulary: vocabularyWith(undefined),
      program: {
        ...emptyProgram,
        payload: {
          root: {
            ...emptyProgram.payload.root,
            edges: { on: { run: [{ do: "invoke", args: { tool: "work" } }] } },
          },
        },
      },
    },
    {
      wrapOrchestrator: (fallback) => ({
        invoke: async (effect, control) => {
          order.push("bundle");
          return fallback.invoke!(effect, control);
        },
      }),
    }
  );

  const runtime = loadBundleRuntime(bundle, {
    wrapOrchestrator: (fallback) => ({
      invoke: async (effect, control) => {
        order.push("host");
        return fallback.invoke!(effect, control);
      },
    }),
  });
  await runtime.controller.emit("root", "run");
  await Promise.resolve();

  assert.deepEqual(order, ["host", "bundle"]);
});
