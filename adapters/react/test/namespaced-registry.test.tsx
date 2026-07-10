// The namespaced vocabulary model: a capability is referenced as `alias:name` and resolved through
// a manifest's `imports` — nothing is ambient. These tests pin the resolver's contract: explicit
// alias binding, provider selection, optional `use` whitelisting, and graceful fallback.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import type { ProjectionViewImport } from "../../../kernel/src/types";
import {
  buildRegistryFromImports,
  splitCapabilityRef,
  type ProjectionView,
  type ProviderMap,
} from "../src/registry";

const A: ProjectionView = () => createElement("a");
const B: ProjectionView = () => createElement("b");
const Fallback: ProjectionView = () => createElement("fallback");

const floor: ProviderMap = { list: A, table: A };
const workbench: ProviderMap = { regionEditor: B };
const resolve = (from: string): ProviderMap | undefined =>
  from === "floor" ? floor : from === "workbench" ? workbench : undefined;

test("splitCapabilityRef splits on the first colon and rejects bare / malformed refs", () => {
  assert.deepEqual(splitCapabilityRef("ui:list"), { alias: "ui", name: "list" });
  assert.equal(splitCapabilityRef("list"), null); // bare — no longer resolvable
  assert.equal(splitCapabilityRef(":list"), null);
  assert.equal(splitCapabilityRef("ui:"), null);
});

test("an imported alias resolves to its provider's component", () => {
  const imports: Record<string, ProjectionViewImport> = { ui: { from: "floor" } };
  const reg = buildRegistryFromImports(imports, resolve, Fallback);
  assert.equal(reg.get("ui:list"), A);
  assert.equal(reg.get("ui:table"), A);
});

test("an unimported alias, a bare ref, and an unknown provider all miss (fall back)", () => {
  const imports: Record<string, ProjectionViewImport> = { ui: { from: "floor" } };
  const reg = buildRegistryFromImports(imports, resolve, Fallback);
  assert.equal(reg.get("wb:regionEditor"), undefined); // alias never imported
  assert.equal(reg.get("list"), undefined); // bare form is gone
  assert.equal(reg.get("x:list"), undefined); // alias bound to nothing
  assert.equal(reg.fallback, Fallback);
});

test("two providers can offer names picked explicitly by alias (cross-provider selection)", () => {
  const imports: Record<string, ProjectionViewImport> = {
    ui: { from: "floor" },
    wb: { from: "workbench" },
  };
  const reg = buildRegistryFromImports(imports, resolve, Fallback);
  assert.equal(reg.get("ui:list"), A);
  assert.equal(reg.get("wb:regionEditor"), B);
});

test("a `use` whitelist restricts which names an alias exposes", () => {
  const imports: Record<string, ProjectionViewImport> = {
    ui: { from: "floor", use: ["list"] }, // table deliberately withheld
  };
  const reg = buildRegistryFromImports(imports, resolve, Fallback);
  assert.equal(reg.get("ui:list"), A);
  assert.equal(reg.get("ui:table"), undefined); // present in provider, not imported
});

test("no imports => nothing resolves (nothing is ambient, not even the floor)", () => {
  const reg = buildRegistryFromImports(undefined, resolve, Fallback);
  assert.equal(reg.get("ui:list"), undefined);
});
