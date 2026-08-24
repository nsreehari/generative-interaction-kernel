// The unmocked counterpart of AppRootPage.test.tsx: the real BlueprintProvider running the real
// embedded Blueprint Studio, with the real component providers, rendered through both region mounts.
// It is what proves that "embedded" is an actual selected manifestation rather than a wiring shape --
// the catalog region really paints catalog entries, and the normal-mode surfaces this shell never
// mounts are never instantiated at all.

import assert from "node:assert/strict";
import React from "react";
import { test } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

import { getSampleBlueprintCatalog } from "../../../catalog/blueprint-catalog";
import { APP_ROOT_BLUEPRINT_ID, AppRootPage } from "./AppRootPage";

/** Copy that only the region-mounted slots can produce, quoted from the Studio Blueprint itself. */
const MOUNTED_SURFACES = [
  "Select a Blueprint to inspect it, or start a new draft.", // catalog-list
] as const;

/** Copy that only the slots this shell deliberately leaves unmounted can produce. */
const UNMOUNTED_SURFACES = [
  "Browse, inspect, edit, and preview governed Blueprints.", // studio-header
  "Blueprint workspace views", // workspace-tabs
  "Choose a Blueprint from the catalog", // workspace-editor empty state
  "Delete Blueprint", // workspace-actions
  "New Blueprint", // catalog-actions
] as const;

async function renderRoot(): Promise<string> {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(AppRootPage));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
  const json = JSON.stringify(renderer.toJSON());
  await act(async () => { renderer.unmount(); });
  return json;
}

test("the application root page paints the embedded Studio catalog through its region mount", async () => {
  const painted = await renderRoot();

  for (const surface of MOUNTED_SURFACES) {
    assert.ok(painted.includes(surface), `expected the catalog region to render ${JSON.stringify(surface)}`);
  }
  // Real catalog data, resolved by the Studio's own service chain -- not fixture text.
  for (const id of getSampleBlueprintCatalog().blueprints) {
    assert.ok(painted.includes(id), `expected the catalog region to list Blueprint '${id}'`);
  }
  assert.ok(painted.includes(APP_ROOT_BLUEPRINT_ID));
});

test("normal-mode Studio surfaces this shell never mounts are never instantiated", async () => {
  const painted = await renderRoot();

  for (const surface of UNMOUNTED_SURFACES) {
    assert.ok(
      !painted.includes(surface),
      `unmounted region content ${JSON.stringify(surface)} must not be instantiated in embedded mode`,
    );
  }
  // The page's own React chrome is unaffected by which Blueprint regions are mounted.
  assert.ok(painted.includes("Generative Interaction Kernel"));
  assert.ok(painted.includes("Live preview"));
});
