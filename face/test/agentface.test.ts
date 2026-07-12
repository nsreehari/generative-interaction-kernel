// Headless checks for the AgentFace TS surface. Runs
// with `node --import tsx --test`. Asserts catalog projection, reference linting, dry-run
// validation, and the author (commit) path, all JSON-shaped and transport-free.

import { test } from "node:test";
import assert from "node:assert/strict";

import { describeCatalog, namespaces, effects } from "../src/pure/catalog";
import { validateDocument, lint, authorDocument } from "../src/pure/document";
import { validateCapability } from "../src/pure/capability";
import { describeInteractions, validateInteraction } from "../src/pure/interaction";
import { validatePresentation } from "../src/pure/presentation";
import { validateIntent, intentToEdits } from "../src/pure/intent";
import { authoringTools } from "../src/pure/authoring-tools";
import { createStatelessAgentFaceDispatcher } from "../src/projections/agentface";
import { defaultPresentationPlanner } from "../../interaction/src/index";
import type { ManifestPayload } from "../../kernel/src/index";

const manifest: ManifestPayload = {
  version: "0.1",
  namespaces: ["ui", "data"],
  capabilities: {
    text: { emits: ["submit"], dataProp: "value" },
    button: { emits: ["click"] },
  },
  externals: { effectHandlers: ["saveItem"] },
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

test("interaction: catalog projects every kind with facets", () => {
  const kinds = describeInteractions();
  assert.ok(kinds.length >= 12);
  const review = kinds.find((k) => k.interaction === "review");
  assert.ok(review && review.facets.some((f) => f.name === "summary" && f.required));
});

test("interaction: known ok; unknown kind / missing subject not ok; synthesized facet warns", () => {
  assert.equal(validateInteraction({ interaction: "review", subject: "pr" }).ok, true);
  assert.equal(validateInteraction({ interaction: "bogus", subject: "x" }).ok, false);
  assert.equal(validateInteraction({ interaction: "review" }).ok, false);
  const codes = new Set(
    validateInteraction({ interaction: "review", subject: "pr", capabilities: ["summary", "ghost"] }).warnings.map((w) => w.code)
  );
  assert.ok(codes.has("synthesized-facet"));
});

test("presentation: planner output is valid; dropping a required facet fails", () => {
  const spec = defaultPresentationPlanner({ interaction: "review", subject: "pr" }, { surface: "desktop" });
  assert.equal(validatePresentation(spec).ok, true);

  const summary = spec.regions.find((r) => r.name === "summary");
  assert.ok(summary); // summary is a required facet of review
  const dropped = { ...spec, regions: spec.regions.filter((r) => r.name !== "summary") };
  const report = validatePresentation(dropped);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((e) => e.detail.includes("summary")));
});

test("presentation: structurally invalid input fails without throwing", () => {
  const report = validatePresentation({ layout: "stack" });
  assert.equal(report.ok, false);
  assert.ok(report.errors.length >= 1);
});

test("intent: shape validated; targets checked against interaction; projects to edits", () => {
  assert.equal(validateIntent({ goal: "triage", priorities: ["summary"] }).ok, true);
  assert.equal(validateIntent({ priorities: "nope" }).ok, false);
  const codes = new Set(
    validateIntent({ priorities: ["ghost"] }, { interaction: "review", subject: "pr" }).warnings.map((w) => w.code)
  );
  assert.ok(codes.has("intent-target-unknown"));

  const edits = intentToEdits({ priorities: ["summary", "detail"] });
  assert.equal(edits.priority.summary, "primary");
  assert.equal(edits.priority.detail, "secondary");
  assert.deepEqual(edits.order, ["summary", "detail"]);
});

test("mcp: registry exposes one tool per method and dispatches", () => {
  const dispatcher = createStatelessAgentFaceDispatcher();
  const tools = dispatcher.listTools();
  const names = new Set(tools.map((t) => t.name));
  for (const n of [
    "describeCatalog",
    "validateDocument",
    "lintDocument",
    "authorDocument",
    "validateCapability",
    "describeInteractions",
    "validateInteraction",
    "validatePresentation",
    "validateIntent",
    "intentToEdits",
  ]) {
    assert.ok(names.has(n), `missing tool ${n}`);
  }
  // every tool advertises an object input schema
  assert.ok(tools.every((t) => (t.inputSchema as { type?: string }).type === "object"));
  assert.equal(authoringTools.length, tools.length);

  const cat = dispatcher.callTool("describeCatalog", { manifest }) as { capabilities: unknown[] };
  assert.equal(cat.capabilities.length, 2);
  assert.throws(() => dispatcher.callTool("nope", {}));
});

test("mcp: JSON-RPC initialize / tools/list / tools/call round trip", () => {
  const dispatcher = createStatelessAgentFaceDispatcher();
  const init = dispatcher.handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize" }) as {
    result: { protocolVersion: string; capabilities: { tools: unknown } };
  };
  assert.ok(init.result.protocolVersion);
  assert.ok(init.result.capabilities.tools);

  const list = dispatcher.handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }) as {
    result: { tools: unknown[] };
  };
  assert.ok(list.result.tools.length >= 10);

  const call = dispatcher.handleMcpMessage({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "validateInteraction", arguments: { spec: { interaction: "review", subject: "pr" } } },
  }) as { result: { structuredContent: { ok: boolean }; content: { type: string; text: string }[] } };
  assert.equal(call.result.structuredContent.ok, true);
  assert.equal(call.result.content[0].type, "text");

  // unknown method -> JSON-RPC error; notification (no id) -> no reply
  const err = dispatcher.handleMcpMessage({ jsonrpc: "2.0", id: 4, method: "bogus" }) as {
    error: { code: number };
  };
  assert.equal(err.error.code, -32601);
  assert.equal(dispatcher.handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }), undefined);
});
