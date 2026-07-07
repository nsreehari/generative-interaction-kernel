// Headless checks for the AgentFace TS surface — the JS peer of GenUI.AgentFace.Check. Runs
// with `node --import tsx --test`. Asserts catalog projection, reference linting, dry-run
// validation, and the author (commit) path, all JSON-shaped and transport-free.

import { test } from "node:test";
import assert from "node:assert/strict";

import { describeCatalog, namespaces, effects } from "../src/catalog";
import { validateDocument, lint, authorDocument } from "../src/document";
import { validateCapability } from "../src/capability";
import type { ManifestPayload } from "../../../kernel/src/index";

const manifest: ManifestPayload = {
  version: "0.1",
  namespaces: ["ui", "data"],
  capabilities: {
    text: { emits: ["submit"], dataProp: "value" },
    button: { emits: ["click"] },
  },
  externals: { effects: ["saveItem"] },
};

const cleanDoc = {
  root: {
    capability: "text",
    id: "t1",
    edges: {
      read: { value: "data.title" },
      on: { submit: [{ do: "assign", target: "ui.saved", args: { value: true } }] },
    },
  },
};

const dirtyDoc = {
  root: {
    capability: "text",
    id: "d1",
    edges: {
      read: { value: "nope.title" },
      on: { hover: [{ do: "invoke", args: { tool: "ghostEffect" } }] },
      children: [{ capability: "mystery", id: "d2" }],
    },
  },
};

test("catalog: projects capabilities, namespaces, effects", () => {
  const catalog = describeCatalog(manifest);
  assert.equal(catalog.capabilities.length, 2);
  assert.equal(catalog.capabilities[0].id, "text");
  assert.deepEqual(namespaces(manifest), ["ui", "data"]);
  assert.deepEqual(effects(manifest), ["saveItem"]);
});

test("lint: clean document has no warnings", () => {
  assert.equal(lint(manifest, cleanDoc).length, 0);
});

test("lint: dirty document flags every reference code", () => {
  const codes = new Set(lint(manifest, dirtyDoc).map((w) => w.code));
  assert.ok(codes.has("unknown-capability"));
  assert.ok(codes.has("undeclared-namespace"));
  assert.ok(codes.has("undeclared-event"));
  assert.ok(codes.has("undeclared-effect"));
});

test("validate: clean ok, structural error not ok", () => {
  assert.equal(validateDocument(manifest, cleanDoc).ok, true);
  const bad = validateDocument(manifest, { root: { capability: "text" } });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length >= 1);
});

test("author: valid commits, invalid rejected", () => {
  const ok = authorDocument(cleanDoc, manifest);
  assert.equal(ok.ok, true);
  assert.ok(ok.message);
  assert.equal(authorDocument({ root: { capability: "text" } }).ok, false);
});

test("capability: well-formed descriptor is ok with no warnings", () => {
  const report = validateCapability({
    id: "chart",
    emits: ["select"],
    slots: ["legend"],
    dataProp: "series",
    propsSchema: { properties: { series: {}, title: {} } },
  });
  assert.equal(report.ok, true);
  assert.equal(report.warnings.length, 0);
});

test("capability: missing id + bad emits -> not ok, dataProp warns", () => {
  const report = validateCapability({
    emits: "nope",
    dataProp: "missing",
    propsSchema: { properties: { x: {} } },
  });
  assert.equal(report.ok, false);
  const codes = new Set(report.warnings.map((w) => w.code));
  assert.ok(codes.has("dataprop-not-in-schema"));
});

test("capability: registry view surfaces shadow + missing-binding warnings", () => {
  const view = { bindings: ["text", "button"], floor: ["text"] };
  const shadow = new Set(validateCapability({ id: "text" }, view).warnings.map((w) => w.code));
  assert.ok(shadow.has("shadows-floor"));
  const unbound = new Set(validateCapability({ id: "newthing" }, view).warnings.map((w) => w.code));
  assert.ok(unbound.has("missing-render-binding"));
});
