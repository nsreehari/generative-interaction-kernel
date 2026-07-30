import { test } from "vitest";
import assert from "node:assert/strict";

import { floorStylesheet, FLOOR_STYLESHEET } from "./styles";

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

test("panel action rows stay layout-only without an inset surface", () => {
  const blocks = [...FLOOR_STYLESHEET.matchAll(/\.gx-host \.gx-panel-actions\s*\{([^}]*)\}/g)];
  assert.equal(blocks.length, 1);
  assert.match(blocks[0][1], /display:\s*flex/);
  assert.doesNotMatch(blocks[0][1], /background|border|padding/);
});

test("floorStylesheet re-scopes every rule under a custom root", () => {
  const css = floorStylesheet(".app-scope");
  assert.ok(css.includes(".app-scope .gx-badge"));
  assert.ok(css.includes(".app-scope .gx-form-grid"));
  assert.doesNotMatch(css, /\.gx-host\b/);
});

// Theme purity: the sheet must express color only through the ThemeProvider (semantic role vars +
// Fluent tokens). The single allowed exception is the data-visualization categorical palette, whose
// series colors are intentionally fixed and are named --gx-dataviz-* so nothing is anonymous.
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g;
const DATAVIZ_DECLARATION = /^\s*--gx-dataviz-[a-z]+:\s*#[0-9a-fA-F]{3,8};\s*$/;

test("shipped sheet has no literal colors outside the named data-viz palette", () => {
  const offenders: string[] = [];
  for (const line of FLOOR_STYLESHEET.split("\n")) {
    if (!line.match(COLOR_LITERAL)) continue;
    if (DATAVIZ_DECLARATION.test(line)) continue; // allow-listed data-viz palette line
    offenders.push(line.trim());
  }
  assert.deepEqual(
    offenders,
    [],
    `every color must be a role var / Fluent token; found literal color(s):\n${offenders.join("\n")}`
  );
});

test("data-viz palette is named and chart slots reference it — nothing color-related is anonymous", () => {
  const css = FLOOR_STYLESHEET;
  for (const name of ["violet", "cyan", "magenta", "lime", "amber", "slate"]) {
    assert.match(css, new RegExp(`--gx-dataviz-${name}:\\s*#[0-9a-fA-F]{3,8};`));
  }
  // Categorical slots reference the named palette, not raw hex.
  assert.match(css, /--gx-chart-5:\s*var\(--gx-dataviz-violet\)/);
  assert.match(css, /--gx-chart-10:\s*var\(--gx-dataviz-slate\)/);
  // Primary slots follow the theme's semantic roles.
  assert.match(css, /--gx-chart-1:\s*var\(--accent\)/);
  assert.match(css, /--gx-chart-4:\s*var\(--bad\)/);
});
