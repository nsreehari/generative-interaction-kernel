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
    ".gx-field select",
    ".gx-btn-primary",
    ".gx-diff-row",
    ".gx-link",
    ".gx-todo-text",
  ]) {
    assert.ok(css.includes(cls), `expected floor stylesheet to define ${cls}`);
  }
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
  assert.doesNotMatch(css, /\.gx-host\b/);
});

// Theme purity: the sheet must express color only through the ThemeProvider.
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g;

test("shipped sheet has no literal colors", () => {
  const offenders: string[] = [];
  for (const line of FLOOR_STYLESHEET.split("\n")) {
    if (!line.match(COLOR_LITERAL)) continue;
    offenders.push(line.trim());
  }
  assert.deepEqual(
    offenders,
    [],
    `every color must be a role var / Fluent token; found literal color(s):\n${offenders.join("\n")}`
  );
});
