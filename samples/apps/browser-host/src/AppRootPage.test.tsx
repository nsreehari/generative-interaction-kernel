import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, vi } from "vitest";
import {
  listExportedPresentationRegions,
  materializeBlueprint,
  type BlueprintArtifact,
} from "@gik/blueprint";

const captured = vi.hoisted(() => ({
  providers: [] as Array<{ id: string; props: Record<string, unknown> }>,
  regions: [] as Array<{ owner: string | null; props: Record<string, unknown> }>,
}));

// The real provider/region pair is covered by the adapter's own tests. Here the question is purely
// compositional: does this page run ONE Blueprint and place exactly the two named regions under it,
// with the external context on the provider and never on a region?
vi.mock("@gik/react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const react = await import("react");
  const ownerContext = react.createContext<string | null>(null);
  let sequence = 0;
  return {
    ...actual,
    BlueprintProvider: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => {
      const id = react.useMemo(() => `provider-${sequence++}`, []);
      captured.providers.push({ id, props });
      return react.createElement(ownerContext.Provider, { value: id }, children);
    },
    BlueprintRegion: (props: Record<string, unknown>) => {
      captured.regions.push({ owner: react.useContext(ownerContext), props });
      return null;
    },
  };
});

import { getSampleBlueprintCatalog } from "../../../catalog/blueprint-catalog";
import {
  APP_ROOT_BLUEPRINT_ID,
  APP_ROOT_EXTERNAL_CONTEXT,
  AppRootPage,
} from "./AppRootPage";

const EXPECTED_REGIONS = ["blueprint-catalog", "blueprint-preview"] as const;

function renderRoot(): string {
  captured.providers.length = 0;
  captured.regions.length = 0;
  return renderToStaticMarkup(React.createElement(AppRootPage));
}

test("the application root page places both regions of one shared embedded Blueprint provider", () => {
  const markup = renderRoot();

  assert.equal(captured.providers.length, 1);
  const [provider] = captured.providers;
  assert.deepEqual(provider.props.externalContext, { mode: "embedded" });
  assert.deepEqual(APP_ROOT_EXTERNAL_CONTEXT, { mode: "embedded" });
  assert.equal((provider.props.blueprint as BlueprintArtifact).payload.id, APP_ROOT_BLUEPRINT_ID);
  // Every trusted dependency the full host route supplies is supplied here too.
  assert.ok(provider.props.native);
  assert.ok(provider.props.context);
  assert.ok(provider.props.blueprintRegistry);
  assert.equal(typeof provider.props.resolveLeavesProvider, "function");
  assert.equal(typeof provider.props.resolveCapabilityDescriptors, "function");

  assert.deepEqual(captured.regions.map(({ props }) => props.name), [...EXPECTED_REGIONS]);
  for (const region of captured.regions) {
    // One provider, one materialization, one controller: the catalog and the preview are two
    // placements of the same running Blueprint, not two instances.
    assert.equal(region.owner, provider.id);
    // A region mount never carries its own external context or Blueprint wiring.
    assert.deepEqual(Object.keys(region.props), ["name"]);
  }

  // React owns the surrounding page; none of it comes from the Blueprint.
  assert.match(markup, /Generative Interaction Kernel/);
  assert.match(markup, /Live preview/);
});

test("the regions the application root page mounts are the ones the embedded Studio exports", () => {
  renderRoot();

  const blueprint = getSampleBlueprintCatalog().entries[APP_ROOT_BLUEPRINT_ID];
  const embedded = materializeBlueprint({ blueprint, externalContext: APP_ROOT_EXTERNAL_CONTEXT });
  const exported = listExportedPresentationRegions(embedded.payload.terminalBlueprint);

  assert.deepEqual(exported.map(({ name }) => name), [...EXPECTED_REGIONS]);
  assert.deepEqual(
    captured.regions.map(({ props }) => props.name).sort(),
    exported.map(({ name }) => name).sort(),
  );
});
