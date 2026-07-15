import { test } from "vitest";
import assert from "node:assert/strict";

import { floorStylesheet, FLOOR_STYLESHEET } from "../src/styles";

test("floor stylesheet ships the leaf design-system classes", () => {
  const css = FLOOR_STYLESHEET;
  for (const cls of [
    ".gx-badge",
    ".gx-metric-detail",
    ".gx-list-row",
    ".gx-table",
    ".gx-table-editable td input",
    ".gx-field select",
    ".gx-form-grid",
    ".gx-col-span-6",
    ".gx-btn-primary",
    ".gx-chart-grid",
    ".gx-diff-row",
    ".gx-link",
    ".gx-todo-text",
  ]) {
    assert.ok(css.includes(cls), `expected floor stylesheet to define ${cls}`);
  }
  // Chart palette vars ship with the sheet so charts recolor with the theme.
  assert.ok(css.includes("--gx-chart-1: var(--accent)"));
});

test("floor stylesheet is scoped to .gx-host by default", () => {
  assert.ok(FLOOR_STYLESHEET.includes(".gx-host .gx-badge"));
});

test("floorStylesheet re-scopes every rule under a custom root", () => {
  const css = floorStylesheet(".app-scope");
  assert.ok(css.includes(".app-scope .gx-badge"));
  assert.ok(css.includes(".app-scope .gx-form-grid"));
  assert.doesNotMatch(css, /\.gx-host\b/);
});
