// The namespaced vocabulary model: a capability is referenced as `alias:name` and resolved through
// a manifest's `imports` — nothing is ambient. These tests pin the resolver's contract: explicit
// alias binding, provider selection, optional `use` whitelisting, and graceful fallback.

import { test } from "vitest";
import assert from "node:assert/strict";
import { createElement } from "react";
import type { CapabilityDescriptor, ProjectionViewImport } from "@gik/kernel";
import {
  buildCapabilityCatalogFromExternals,
  buildCapabilityCatalogFromImports,
  buildRegistryFromImports,
  splitCapabilityRef,
  type CapabilityDescriptorMap,
  type ProjectionView,
  type ProviderMap,
} from "../src/registry";
import { bundleFromJson } from "../src/primitives/bundle";
import { buildBundleRegistry } from "../src/primitives/registry";

const A: ProjectionView = () => createElement("a");
const B: ProjectionView = () => createElement("b");
const Fallback: ProjectionView = () => createElement("fallback");

const catalog: ProviderMap = { list: A, table: A };
const workbench: ProviderMap = { regionEditor: B };
const resolve = (from: string): ProviderMap | undefined =>
  from === "catalog" ? catalog : from === "workbench" ? workbench : undefined;

test("splitCapabilityRef splits on the first colon and rejects bare / malformed refs", () => {
  assert.deepEqual(splitCapabilityRef("ui:list"), { alias: "ui", name: "list" });
  assert.equal(splitCapabilityRef("list"), null); // bare — no longer resolvable
  assert.equal(splitCapabilityRef(":list"), null);
  assert.equal(splitCapabilityRef("ui:"), null);
});

test("an imported alias resolves to its provider's component", () => {
  const imports: Record<string, ProjectionViewImport> = { ui: { from: "catalog" } };
  const reg = buildRegistryFromImports(imports, resolve, Fallback);
  assert.equal(reg.get("ui:list"), A);
  assert.equal(reg.get("ui:table"), A);
});

test("an unimported alias, a bare ref, and an unknown provider all miss (fall back)", () => {
  const imports: Record<string, ProjectionViewImport> = { ui: { from: "catalog" } };
  const reg = buildRegistryFromImports(imports, resolve, Fallback);
  assert.equal(reg.get("wb:regionEditor"), undefined); // alias never imported
  assert.equal(reg.get("list"), undefined); // bare form is gone
  assert.equal(reg.get("x:list"), undefined); // alias bound to nothing
  assert.equal(reg.fallback, Fallback);
});

test("two providers can offer names picked explicitly by alias (cross-provider selection)", () => {
  const imports: Record<string, ProjectionViewImport> = {
    ui: { from: "catalog" },
    wb: { from: "workbench" },
  };
  const reg = buildRegistryFromImports(imports, resolve, Fallback);
  assert.equal(reg.get("ui:list"), A);
  assert.equal(reg.get("wb:regionEditor"), B);
});

test("a `use` whitelist restricts which names an alias exposes", () => {
  const imports: Record<string, ProjectionViewImport> = {
    ui: { from: "catalog", use: ["list"] }, // table deliberately withheld
  };
  const reg = buildRegistryFromImports(imports, resolve, Fallback);
  assert.equal(reg.get("ui:list"), A);
  assert.equal(reg.get("ui:table"), undefined); // present in provider, not imported
});

test("no imports => nothing resolves (nothing is ambient)", () => {
  const reg = buildRegistryFromImports(undefined, resolve, Fallback);
  assert.equal(reg.get("ui:list"), undefined);
});

test("reserved structural views resolve without weakening vocabulary imports", () => {
  const bundle = bundleFromJson({
    vocabulary: {
      gik: "0.1",
      type: "vocabulary",
      payload: { version: "structural/1", namespaces: [], capabilities: {} },
    },
    program: {
      gik: "0.1",
      type: "program",
      payload: { root: { capability: "gik:blueprint", id: "child" } },
    },
  });
  const reg = buildBundleRegistry(bundle, resolve, { "gik:blueprint": A });

  assert.equal(reg.get("gik:blueprint"), A);
  assert.equal(reg.get("ui:list"), undefined);
});

// --- Capability-descriptor resolution: the descriptor-side counterpart of the above -----------

const listDescriptor: CapabilityDescriptor = { propsSchema: { type: "object" }, emits: [] };
const tableDescriptor: CapabilityDescriptor = { propsSchema: { type: "object" }, emits: ["select"] };
const regionEditorDescriptor: CapabilityDescriptor = { propsSchema: { type: "object" }, emits: [] };
const descriptorCatalog: CapabilityDescriptorMap = { list: listDescriptor, table: tableDescriptor };
const descriptorWorkbench: CapabilityDescriptorMap = { regionEditor: regionEditorDescriptor };
const resolveDescriptors = (from: string): CapabilityDescriptorMap | undefined =>
  from === "catalog" ? descriptorCatalog : from === "workbench" ? descriptorWorkbench : undefined;

test("buildCapabilityCatalogFromImports resolves alias:name through the same imports a view registry uses", () => {
  const imports: Record<string, ProjectionViewImport> = {
    ui: { from: "catalog" },
    wb: { from: "workbench" },
  };
  const catalog = buildCapabilityCatalogFromImports(imports, resolveDescriptors);
  assert.deepEqual(catalog, {
    "ui:list": listDescriptor,
    "ui:table": tableDescriptor,
    "wb:regionEditor": regionEditorDescriptor,
  });
});

test("buildCapabilityCatalogFromImports honors a `use` whitelist and omits unresolved providers/imports", () => {
  const imports: Record<string, ProjectionViewImport> = {
    ui: { from: "catalog", use: ["list"] },
    wb: { from: "unregistered-provider" },
  };
  const catalog: CapabilityDescriptorMap = buildCapabilityCatalogFromImports(imports, resolveDescriptors);
  assert.equal(catalog["ui:table"], undefined);
  assert.equal(catalog["wb:regionEditor"], undefined);
  assert.deepEqual(catalog, { "ui:list": listDescriptor });
});

test("buildCapabilityCatalogFromImports with no imports produces an empty catalog", () => {
  assert.deepEqual(buildCapabilityCatalogFromImports(undefined, resolveDescriptors), {});
});

test("buildCapabilityCatalogFromExternals reads externals.projectionViews the same way materializeBlueprint's option expects", () => {
  const catalog = buildCapabilityCatalogFromExternals(
    { projectionViews: { ui: { from: "catalog" } } },
    resolveDescriptors,
  );
  assert.deepEqual(catalog, { "ui:list": listDescriptor, "ui:table": tableDescriptor });
  assert.deepEqual(buildCapabilityCatalogFromExternals(undefined, resolveDescriptors), {});
});
