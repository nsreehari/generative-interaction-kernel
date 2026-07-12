// Mount-time enforcement of a bundle's `externals.effectHandlers` contract: every effect-handler
// name the manifest declares must be supplied by the bundle's native code, or the bundle is rejected
// at load instead of silently no-op'ing the `invoke` deep in the reducer at runtime. Scoped to the
// effect arm only — `externals.projectionViews` are provider imports resolved against the floor/embed
// registries, not against `bundle.projectionViews`, so they are not checked here.

import { test } from "vitest";
import assert from "node:assert/strict";

import { assertExternalsSatisfied, bundleFromJson, loadBundle } from "../src/primitives";

const manifestWith = (effectHandlers?: string[]) => ({
  type: "manifest",
  payload: {
    version: "test/1",
    namespaces: ["app"],
    capabilities: {},
    ...(effectHandlers ? { externals: { effectHandlers } } : {}),
  },
});

const emptyDocument = {
  type: "document",
  payload: { root: { id: "root", capability: "board", props: {} } },
};

test("assertExternalsSatisfied: throws when a declared effect handler is missing", () => {
  const bundle = bundleFromJson(
    { manifest: manifestWith(["saveProfile"]), document: emptyDocument },
    { effectHandlers: {} }
  );
  assert.throws(() => assertExternalsSatisfied(bundle), /saveProfile/);
});

test("assertExternalsSatisfied: passes when every declared effect handler is supplied", () => {
  const bundle = bundleFromJson(
    { manifest: manifestWith(["saveProfile"]), document: emptyDocument },
    { effectHandlers: { saveProfile: () => {} } }
  );
  assert.doesNotThrow(() => assertExternalsSatisfied(bundle));
});

test("assertExternalsSatisfied: no-ops when the bundle declares no externals.effectHandlers", () => {
  const bundle = bundleFromJson(
    { manifest: manifestWith(undefined), document: emptyDocument },
    { effectHandlers: {} }
  );
  assert.doesNotThrow(() => assertExternalsSatisfied(bundle));
});

test("loadBundle: mount-time gate rejects a bundle missing a declared effect handler", () => {
  const bundle = bundleFromJson(
    { manifest: manifestWith(["charge"]), document: emptyDocument },
    { effectHandlers: {} }
  );
  assert.throws(() => loadBundle(bundle), /charge/);
});
